// Z_AMS (maktab kameralari bilan avtomatik davomat dasturi) bilan ulanish.
// Z_AMS o'quvchilar va sinflar ro'yxatini yuboradi (ism va sinf Z_AMS'dan keladi),
// har dars natijasini o'quvchi bo'yicha yuboradi. Ulanishga faqat Z_AMS admin paneli
// ruxsat bergan maktab kira oladi (tekshiruv API serverda). Hujjat: ZAMS.md

import { CommandError, applyPatch, mergePatches, type Patch } from "./patch";
import { executeCommand } from "./server";
import { inClass } from "./membership";
import { addDays, isoWeekday } from "./dates";
import { nvrAttendancePatch } from "./integration";
import type { AppUser, Database, Institution, SchoolClass, Student } from "./types";

export const ZAMS_API_VERSION = "v1";
/** Z_AMS admin paneli "Ulab berish"da beradigan kalit. */
export const ZAMS_KEY_PATTERN = /^zedu_[A-Za-z0-9_-]{20,80}$/;
export const ZAMS_MAX_STUDENTS = 5000;

export interface ZamsRosterInput {
  /** true: ro'yxatda yo'q (Z_AMS'dan o'chirilgan) bog'langan o'quvchilar arxivlanadi. */
  full?: boolean;
  students: { id: string | number; name: string; className: string; active?: boolean }[];
}

export interface ZamsRosterResult {
  classesCreated: string[];
  created: number;
  linked: number;
  updated: number;
  archived: number;
  restored: number;
  unchanged: number;
  /** Z_AMS ID -> EduNazorat o'quvchi ID. */
  map: Record<string, string>;
}

export interface ZamsLessonInput {
  day: string;
  /** Z_AMS'dagi dars raqami (jurnal uchun). */
  lessonNo?: number;
  /** Z_AMS dars boshlanish vaqti "08:30": shu vaqtga to'g'ri keladigan EduNazorat darsi topiladi. */
  start: string;
  classes: { className: string; present: (string | number)[]; absent: (string | number)[] }[];
}

export interface ZamsLessonResult {
  classes: {
    className: string;
    lessonId?: string;
    subject?: string;
    applied: number;
    skipped: number;
    reason?: "noClass" | "noLesson" | "empty";
  }[];
}

/** Bir yozuv bir necha marta o'zgarsa, faqat oxirgi holati qoladi. */
function dedupe(p: Patch): Patch {
  for (const [k, items] of Object.entries(p.upsert ?? {})) {
    const last = new Map<string, unknown>();
    for (const it of items as { id: string }[]) last.set(it.id, it);
    (p.upsert as Record<string, unknown[]>)[k] = [...last.values()];
  }
  return p;
}

const bad = (field: string) => new CommandError("err.required", { field }, 400);

/** "5a", "5 A", "5-а" (kirill) -> "5-a". Z_AMS'dagi normalize_class_id bilan bir xil mantiq. */
export function zamsClassKey(name: string): string {
  const s = String(name ?? "").trim().replace(/\s+/g, " ");
  const latin = s.toUpperCase().replace(/[АВЕКМНОРСТХ]/g, (c) => "ABEKMHOPCTX"["АВЕКМНОРСТХ".indexOf(c)]);
  const m = /^(\d{1,2})\s*[-‐-―_.\s]?\s*(\p{L}+)$/u.exec(latin);
  return (m ? `${Number(m[1])}-${m[2]}` : latin).toLowerCase();
}

const nameKey = (s: string) => s.trim().replace(/\s+/g, " ").replace(/[ʻʼ’‘`´]/g, "'").toLowerCase().replace(/ё/g, "е");
export const zamsExternalId = (schoolId: number, id: string | number) => `zams:${schoolId}:${id}`;

/**
 * O'quvchi Z_AMS orqali keladi: davomatini maktab kamerasi (Z_AMS) oladi, biometrik rozilik maktabda qog'ozda olinadi.
 * EduNazorat'ning o'z yuz tanishi (o'qituvchi telefoni) bu o'quvchiga ishlatilmaydi, shuning uchun ota-onadan
 * EduNazorat yuz roziligi so'ralmaydi.
 */
export const isZamsLinked = (s: { externalId?: string }) => !!s.externalId?.startsWith("zams:");

/** Tizim nomidan buyruq bajaruvchi (shu muassasa administratori huquqi bilan). */
function systemActor(inst: Institution): AppUser {
  return { id: `zams:${inst.id}`, name: "Z_AMS", phone: "", role: "admin", institutionId: inst.id, subjects: [], childIds: [], active: true } as AppUser;
}

/** Ishchi nusxa: buyruqlar ketma-ket bajariladi va har biri oldingilarini ko'radi. */
function workingCopy(db: Database): Database {
  const w = { ...db } as Database;
  for (const k of ["students", "users", "invoices", "classes", "attendance", "notifications"] as const) {
    (w as unknown as Record<string, unknown[]>)[k] = [...(db as unknown as Record<string, unknown[]>)[k]];
  }
  return w;
}

/**
 * Z_AMS ro'yxati -> EduNazorat. Z_AMS ism, sinf va faollikni boshqaradi; ota-onalar, telefonlar,
 * to'lovlar va boshqa ma'lumotlar EduNazorat'da qoladi (ustidan yozilmaydi).
 * Birinchi marta: bog'lanmagan o'quvchi ism + sinf bo'yicha topilsa bog'lanadi, aks holda yaratiladi.
 */
export function zamsRosterPatch(db: Database, inst: Institution, schoolId: number, input: ZamsRosterInput, now: number): { patch: Patch; result: ZamsRosterResult } {
  if (!input || typeof input !== "object" || !Array.isArray(input.students)) throw bad("students");
  if (input.students.length === 0 || input.students.length > ZAMS_MAX_STUDENTS) throw bad("students");
  const rows = input.students.map((r, i) => {
    const id = String(r?.id ?? "").trim();
    const name = String(r?.name ?? "").trim().replace(/\s+/g, " ");
    const className = String(r?.className ?? "").trim();
    if (!/^[\w-]{1,40}$/.test(id) || !name || name.length > 120 || !className || className.length > 40) {
      throw new CommandError("err.importRow", { row: i + 1, error: "err.required" }, 400);
    }
    return { id, name, className, active: r.active !== false, ext: zamsExternalId(schoolId, id) };
  });
  if (new Set(rows.map((r) => r.id)).size !== rows.length) throw bad("students.id");

  const w = workingCopy(db);
  const actor = systemActor(inst);
  const patches: Patch[] = [];
  const run = <K extends Parameters<typeof executeCommand>[2]>(name: K, payload: Parameters<typeof executeCommand<K>>[3]) => {
    const p = executeCommand(w, actor, name, payload, now);
    applyPatch(w, p);
    patches.push(p);
    return p;
  };
  const result: ZamsRosterResult = { classesCreated: [], created: 0, linked: 0, updated: 0, archived: 0, restored: 0, unchanged: 0, map: {} };

  // Sinflar
  const classByKey = new Map<string, SchoolClass>();
  for (const c of w.classes) if (c.institutionId === inst.id) classByKey.set(zamsClassKey(c.name), c);
  for (const r of rows) {
    if (!r.active || classByKey.has(zamsClassKey(r.className))) continue;
    const p = run("class.save", { name: r.className, monthlyFee: 0 });
    const cls = p.upsert!.classes![0];
    classByKey.set(zamsClassKey(cls.name), cls);
    result.classesCreated.push(cls.name);
  }

  const mine = (s: Student) => s.institutionId === inst.id;
  const byExt = new Map(w.students.filter((s) => mine(s) && s.externalId).map((s) => [s.externalId!, s]));
  const prefix = zamsExternalId(schoolId, "");

  // To'liq ro'yxat: Z_AMS'da yo'q bog'langan o'quvchilar arxivga. Xato ro'yxat hammani arxivlamasin.
  const incoming = new Set(rows.map((r) => r.ext));
  const gone = input.full ? [...byExt.values()].filter((s) => s.externalId!.startsWith(prefix) && !s.archived && !incoming.has(s.externalId!)) : [];
  const linkedActive = [...byExt.values()].filter((s) => s.externalId!.startsWith(prefix) && !s.archived).length;
  if (gone.length > 10 && gone.length > linkedActive / 2) throw new CommandError("err.zamsMassArchive", { n: gone.length }, 400);

  const setExt = (p: Patch, ext: string) => {
    const s = p.upsert?.students?.[0];
    if (s) {
      s.externalId = ext;
      const i = w.students.findIndex((x) => x.id === s.id);
      if (i >= 0) w.students[i] = { ...w.students[i], externalId: ext };
    }
  };

  for (const r of rows) {
    let s = byExt.get(r.ext);
    if (!s && r.active) {
      // Birinchi ulanish: ism + sinf bo'yicha yagona bog'lanmagan o'quvchi
      const ck = zamsClassKey(r.className);
      const cands = w.students.filter((x) => mine(x) && !x.externalId && !x.archived && nameKey(x.name) === nameKey(r.name)
        && zamsClassKey(w.classes.find((c) => c.id === x.classId)?.name ?? "") === ck);
      if (cands.length === 1) {
        s = { ...cands[0], externalId: r.ext };
        const i = w.students.findIndex((x) => x.id === s!.id);
        w.students[i] = s;
        patches.push({ upsert: { students: [s] } });
        byExt.set(r.ext, s);
        result.linked++;
      }
    }
    if (!s) {
      if (!r.active) continue;                                  // arxivdagini yangidan yaratmaymiz
      const cls = classByKey.get(zamsClassKey(r.className))!;
      const p = run("student.save", { name: r.name, classId: cls.id, parents: [] });
      setExt(p, r.ext);
      s = p.upsert!.students![0];
      byExt.set(r.ext, s);
      result.created++;
      result.map[r.id] = s.id;
      continue;
    }
    result.map[r.id] = s.id;
    if (!r.active) {
      if (!s.archived) {
        run("student.archive", { id: s.id, archived: true });
        result.archived++;
      } else result.unchanged++;
      continue;
    }
    if (s.archived) {
      run("student.archive", { id: s.id, archived: false });
      s = w.students.find((x) => x.id === s!.id)!;
      result.restored++;
    }
    const cls = classByKey.get(zamsClassKey(r.className))!;
    if (s.name === r.name && s.classId === cls.id) {
      result.unchanged++;
      continue;
    }
    // Ism yoki sinf o'zgargan: boshqa hamma narsa (ota-onalar, telefon, guruhlar) saqlanadi
    const parents = s.parentIds.map((id) => w.users.find((u) => u.id === id)).filter((u): u is AppUser => !!u && !!u.phone).map((u) => ({ name: u.name, phone: u.phone }));
    const acc = s.userId ? w.users.find((u) => u.id === s!.userId) : undefined;
    const p = run("student.save", {
      id: s.id, name: r.name, classId: cls.id, parents, birthDay: s.birthDay,
      extraClassIds: s.extraClassIds, adult: s.adult, studentPhone: acc?.phone || undefined,
    });
    setExt(p, r.ext);
    result.updated++;
  }
  for (const s of gone) {
    run("student.archive", { id: s.id, archived: true });
    result.archived++;
  }

  const link = inst.settings.zams;
  const instPatch: Patch = { upsert: { institutions: [{ ...inst, settings: { ...inst.settings, zams: { ...(link ?? { schoolId, linkedAt: now }), schoolId, lastSyncAt: now } } }] } };
  return { patch: dedupe(mergePatches(...patches, instPatch)), result };
}

const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/**
 * Z_AMS dars natijasi -> EduNazorat davomati. Har sinf uchun o'sha kun va vaqtdagi dars topiladi:
 * avval aynan shu vaqtda boshlanadigani, so'ng shu vaqtni o'z ichiga olgani, so'ng 15 daqiqagacha yaqini.
 * O'qituvchi o'zi belgilagan yozuvlar o'zgarmaydi (nvrAttendancePatch qoidasi).
 */
export function zamsLessonPatch(db: Database, inst: Institution, schoolId: number, input: ZamsLessonInput, now: number, today: string): { patch: Patch; result: ZamsLessonResult } {
  if (!input || typeof input !== "object") throw bad("body");
  if (typeof input.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.day)) throw bad("day");
  if (input.day < addDays(today, -7) || input.day > addDays(today, 1)) throw new CommandError("err.zamsDayRange", { day: input.day }, 400);
  if (typeof input.start !== "string" || !HM.test(input.start)) throw bad("start");
  if (!Array.isArray(input.classes) || input.classes.length > 300) throw bad("classes");

  const wd = isoWeekday(input.day);
  const t = minutes(input.start);
  const w = workingCopy(db);
  const patches: Patch[] = [];
  const result: ZamsLessonResult = { classes: [] };
  const classes = new Map(w.classes.filter((c) => c.institutionId === inst.id).map((c) => [zamsClassKey(c.name), c]));
  const byExt = new Map(w.students.filter((s) => s.institutionId === inst.id && s.externalId).map((s) => [s.externalId!, s]));

  for (const entry of input.classes) {
    const className = String(entry?.className ?? "");
    const present = Array.isArray(entry?.present) ? entry.present : [];
    const absent = Array.isArray(entry?.absent) ? entry.absent : [];
    if (present.length + absent.length > 200) throw bad("classes.present");
    const cls = classes.get(zamsClassKey(className));
    if (!cls) {
      result.classes.push({ className, applied: 0, skipped: present.length + absent.length, reason: "noClass" });
      continue;
    }
    const todays = w.lessons.filter((l) => l.classId === cls.id && l.weekday === wd);
    const lesson = todays.find((l) => l.start === input.start)
      ?? todays.find((l) => minutes(l.start) <= t && t < minutes(l.end))
      ?? todays.filter((l) => Math.abs(minutes(l.start) - t) <= 15).sort((a, b) => Math.abs(minutes(a.start) - t) - Math.abs(minutes(b.start) - t))[0];
    if (!lesson) {
      result.classes.push({ className: cls.name, applied: 0, skipped: present.length + absent.length, reason: "noLesson" });
      continue;
    }
    let skipped = 0;
    const marks: { studentId: string; status: "present" | "absent" }[] = [];
    for (const [ids, status] of [[present, "present"], [absent, "absent"]] as const) {
      for (const id of ids) {
        const s = byExt.get(zamsExternalId(schoolId, String(id)));
        if (s && !s.archived && inClass(s, cls.id)) marks.push({ studentId: s.id, status });
        else skipped++;
      }
    }
    if (!marks.length) {
      result.classes.push({ className: cls.name, lessonId: lesson.id, subject: lesson.subject, applied: 0, skipped, reason: "empty" });
      continue;
    }
    const r = nvrAttendancePatch(w, inst, { lessonId: lesson.id, day: input.day, cameraId: `Z_AMS ${input.lessonNo ?? ""}`.trim(), marks }, now);
    applyPatch(w, r.patch);
    patches.push(r.patch);
    result.classes.push({ className: cls.name, lessonId: lesson.id, subject: lesson.subject, applied: r.result.applied, skipped: skipped + r.result.skipped.length });
  }
  if (inst.settings.zams) {
    patches.push({ upsert: { institutions: [{ ...inst, settings: { ...inst.settings, zams: { ...inst.settings.zams, lastSyncAt: now } } }] } });
  }
  return { patch: dedupe(mergePatches(...patches)), result };
}
