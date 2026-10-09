import { toMinutes } from "./dates";
import type { Lesson } from "./types";

export function overlaps(a: Pick<Lesson, "weekday" | "start" | "end">, b: Pick<Lesson, "weekday" | "start" | "end">): boolean {
  if (a.weekday !== b.weekday) return false;
  return toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end);
}

export type ScheduleConflict = { kind: "class" | "teacher" | "room"; lesson: Lesson };

/** Yangi/tahrirlangan dars boshqa darslar bilan to'qnashadimi (sinf, o'qituvchi yoki xona). */
export function findConflicts(candidate: Omit<Lesson, "id"> & { id?: string }, lessons: Lesson[]): ScheduleConflict[] {
  const out: ScheduleConflict[] = [];
  for (const l of lessons) {
    if (l.id === candidate.id || !overlaps(candidate, l)) continue;
    if (l.classId === candidate.classId) out.push({ kind: "class", lesson: l });
    else if (l.teacherId === candidate.teacherId) out.push({ kind: "teacher", lesson: l });
    else if (candidate.room && l.room && l.room === candidate.room) out.push({ kind: "room", lesson: l });
  }
  return out;
}

export function validTimeRange(start: string, end: string): boolean {
  return /^\d{2}:\d{2}$/.test(start) && /^\d{2}:\d{2}$/.test(end) && toMinutes(start) < toMinutes(end);
}

/** Odatiy maktab soatlari (tanlash uchun). */
export const DEFAULT_SLOTS: [string, string][] = [
  ["08:30", "09:15"], ["09:25", "10:10"], ["10:20", "11:05"], ["11:20", "12:05"],
  ["12:15", "13:00"], ["13:10", "13:55"], ["14:05", "14:50"],
];
