import { atTime } from "./dates";
import type { AttendanceRecord, AttendanceStatus, Lesson } from "./types";

export const PRESENT_STATUSES: AttendanceStatus[] = ["present", "late"];

export function isPresent(s: AttendanceStatus): boolean {
  return s === "present" || s === "late";
}

/** Kamera yoki "keldi" bosilganda: dars boshlanganidan keyin kech qolsa "kechikdi". */
export function arrivalStatus(lesson: Pick<Lesson, "start">, day: string, now: number, lateAfterMinutes: number): AttendanceStatus {
  return now > atTime(day, lesson.start) + lateAfterMinutes * 60000 ? "late" : "present";
}

export interface DaySummary {
  /** Kamida bitta darsda bo'lganmi */
  status: AttendanceStatus | null;
  /** Birinchi kelgan vaqti (birinchi "keldi/kechikdi" belgisi). */
  arrivedAt?: number;
  /** Shu kungi birinchi yuz kesimi. */
  snapshot?: string;
  viaFace: boolean;
  marked: number;
  presentLessons: number;
  absentLessons: number;
}

/**
 * O'quvchining bir kunlik davomati (darslar bo'yicha yozuvlardan).
 * Biror darsga kelgan bo'lsa: keldi (birinchi darsga kechikkan bo'lsa: kechikdi).
 * Hamma belgilangan darslarda yo'q bo'lsa: kelmadi yoki sababli.
 */
export function summarizeDay(records: AttendanceRecord[], lessons: Lesson[]): DaySummary {
  const order = new Map(lessons.map((l) => [l.id, l.start]));
  const sorted = [...records].sort((a, b) => (order.get(a.lessonId) ?? "").localeCompare(order.get(b.lessonId) ?? ""));
  const present = sorted.filter((r) => isPresent(r.status));
  const absent = sorted.filter((r) => !isPresent(r.status));
  if (sorted.length === 0) return { status: null, viaFace: false, marked: 0, presentLessons: 0, absentLessons: 0 };
  let status: AttendanceStatus;
  if (present.length) status = present[0].status;
  else status = absent.every((r) => r.status === "excused") ? "excused" : "absent";
  const first = present[0];
  return {
    status,
    arrivedAt: first ? Math.min(...present.map((r) => r.markedAt)) : undefined,
    snapshot: present.find((r) => r.snapshot)?.snapshot,
    viaFace: present.some((r) => r.source === "face"),
    marked: sorted.length,
    presentLessons: present.length,
    absentLessons: absent.length,
  };
}

/** Foiz: belgilangan darslardan nechtasida bo'lgan. */
export function attendanceRate(records: AttendanceRecord[]): number | null {
  if (records.length === 0) return null;
  return records.filter((r) => isPresent(r.status)).length / records.length;
}
