// NVR (maktab kameralari tizimi) bilan integratsiya: ixtiyoriy modul.
// NVR loyihasi muassasa kaliti bilan o'quvchilar ro'yxati va dars jadvalini oladi,
// sinf kamerasidan olingan dars davomatini yuboradi. Hujjat: INTEGRATSIYA.md

import { isPresent } from "./attendance";
import { CommandError } from "./patch";
import { hm, isoWeekday } from "./dates";
import { newId } from "./ids";
import { notifyAttendance } from "./notify";
import type { Patch } from "./patch";
import type { AppNotification, AttendanceRecord, AttendanceStatus, Database, Institution } from "./types";

export const NVR_API_VERSION = "v1";
/** Kalit ko'rinishi: "edn_" + 48 ta hex belgi (192 bit). Serverda faqat SHA-256 xeshi saqlanadi. */
export const NVR_KEY_PATTERN = /^edn_[0-9a-f]{48}$/;
const MAX_SNAPSHOT = 80_000;

export interface NvrRoster {
  institution: { id: string; name: string };
  classes: { id: string; name: string }[];
  students: { id: string; name: string; classId: string; faceConsent: boolean }[];
}

export interface NvrLesson {
  id: string;
  classId: string;
  className: string;
  subject: string;
  start: string;
  end: string;
  room: string;
  teacher: string;
}

export interface NvrAttendanceInput {
  lessonId: string;
  day: string;
  /** NVR tomonidagi kamera nomi/ID (jurnal uchun). */
  cameraId?: string;
  marks: {
    studentId: string;
    status: Exclude<AttendanceStatus, "excused">;
    /** Kamera o'quvchini birinchi ko'rgan vaqt (epoch ms). */
    seenAt?: number;
    /** Tanish ishonchi 0..1. */
    confidence?: number;
    /** Faqat shu o'quvchining yuz kesimi: data:image/jpeg;base64,... (ota-onaga boradi). */
    snapshot?: string;
  }[];
}

export interface NvrAttendanceResult {
  applied: number;
  skipped: { studentId: string; reason: "teacherMarked" | "unknownStudent" | "badStatus" }[];
}

const bad = (field: string) => new CommandError("err.required", { field }, 400);

/** Faqat yuz tanishga rozilik bergan o'quvchilar NVR uchun "tanish mumkin" deb belgilanadi. */
export function nvrRoster(db: Database, inst: Institution): NvrRoster {
  const classes = db.classes.filter((c) => c.institutionId === inst.id);
  const ids = new Set(classes.map((c) => c.id));
  return {
    institution: { id: inst.id, name: inst.name },
    classes: classes.map((c) => ({ id: c.id, name: c.name })),
    students: db.students
      .filter((s) => !s.archived && ids.has(s.classId))
      .map((s) => ({ id: s.id, name: s.name, classId: s.classId, faceConsent: s.parentConsent })),
  };
}

export function nvrSchedule(db: Database, inst: Institution, day: string): NvrLesson[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw bad("day");
  const wd = isoWeekday(day);
  const classes = new Map(db.classes.filter((c) => c.institutionId === inst.id).map((c) => [c.id, c]));
  return db.lessons
    .filter((l) => l.weekday === wd && classes.has(l.classId))
    .sort((a, b) => a.start.localeCompare(b.start) || a.room.localeCompare(b.room))
    .map((l) => ({
      id: l.id, classId: l.classId, className: classes.get(l.classId)!.name, subject: l.subject,
      start: l.start, end: l.end, room: l.room, teacher: db.users.find((u) => u.id === l.teacherId)?.name ?? "",
    }));
}

/**
 * NVR'dan kelgan dars davomati. O'qituvchi o'zi belgilagan yozuvlar ustidan
 * yozilmaydi (o'qituvchi so'zi ustun). Holat o'zgarganda ota-onaga xabar boradi.
 */
export function nvrAttendancePatch(db: Database, inst: Institution, input: NvrAttendanceInput, now: number): { patch: Patch; result: NvrAttendanceResult } {
  if (!input || typeof input !== "object") throw bad("body");
  if (typeof input.lessonId !== "string") throw bad("lessonId");
  if (typeof input.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.day)) throw bad("day");
  if (!Array.isArray(input.marks) || input.marks.length === 0 || input.marks.length > 200) throw bad("marks");
  const lesson = db.lessons.find((l) => l.id === input.lessonId);
  const cls = lesson && db.classes.find((c) => c.id === lesson.classId && c.institutionId === inst.id);
  if (!lesson || !cls) throw new CommandError("err.notFound", {}, 404);
  if (isoWeekday(input.day) !== lesson.weekday) throw new CommandError("err.nvrWrongDay", { day: input.day }, 400);

  const attendance: AttendanceRecord[] = [];
  const notes: AppNotification[] = [];
  const result: NvrAttendanceResult = { applied: 0, skipped: [] };
  const by = `nvr:${inst.id}`;
  for (const m of input.marks) {
    const s = db.students.find((x) => x.id === m?.studentId && x.classId === cls.id && !x.archived);
    if (!s) {
      result.skipped.push({ studentId: String(m?.studentId ?? ""), reason: "unknownStudent" });
      continue;
    }
    if (m.status !== "present" && m.status !== "late" && m.status !== "absent") {
      result.skipped.push({ studentId: s.id, reason: "badStatus" });
      continue;
    }
    const prev = db.attendance.find((a) => a.studentId === s.id && a.lessonId === lesson.id && a.day === input.day);
    if (prev && prev.source !== "nvr") {
      result.skipped.push({ studentId: s.id, reason: "teacherMarked" });
      continue;
    }
    const snap = typeof m.snapshot === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(m.snapshot) && m.snapshot.length <= MAX_SNAPSHOT ? m.snapshot : undefined;
    const seen = typeof m.seenAt === "number" && m.seenAt > 0 && m.seenAt <= now + 60_000 ? m.seenAt : now;
    const score = typeof m.confidence === "number" && m.confidence >= 0 && m.confidence <= 1 ? m.confidence : undefined;
    const rec: AttendanceRecord = {
      id: prev?.id ?? newId("a"), studentId: s.id, lessonId: lesson.id, day: input.day, status: m.status, source: "nvr",
      markedAt: seen, markedBy: by, snapshot: isPresent(m.status) ? (snap ?? prev?.snapshot) : undefined, matchScore: score,
    };
    attendance.push(rec);
    result.applied++;
    if (prev?.status === m.status) continue;
    const draft = notifyAttendance({ student: s.name, subject: lesson.subject, time: hm(seen), status: m.status, viaFace: true, snapshot: rec.snapshot, studentId: s.id });
    for (const userId of new Set(s.parentIds)) notes.push({ id: newId("n"), userId, ...draft, time: now, read: false });
  }
  return { patch: { upsert: { attendance, notifications: notes } }, result };
}
