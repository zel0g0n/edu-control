import { isPresent } from "./attendance";
import { invoicePaid, invoiceRemaining } from "./billing";
import { weightedAverage } from "./grades";
import type { AttendanceRecord, Grade, Invoice, Lesson, SchoolClass, Student } from "./types";

export interface ClassAttendanceRow { classId: string; className: string; marked: number; present: number; rate: number | null }

/**
 * Sinf/guruh bo'yicha davomat. lessons berilsa yozuv dars qaysi guruhniki bo'lsa o'shanga
 * hisoblanadi (o'quv markazi: bir o'quvchi bir nechta guruhda); aks holda asosiy sinf bo'yicha.
 */
export function attendanceByClass(classes: SchoolClass[], students: Student[], records: AttendanceRecord[], lessons?: Lesson[]): ClassAttendanceRow[] {
  const classOf = new Map(students.map((s) => [s.id, s.classId]));
  const lessonClass = new Map((lessons ?? []).map((l) => [l.id, l.classId]));
  // Bir o'tishda (sinflar x yozuvlar emas): katta maktabda yuz minglab yozuv
  const tally = new Map<string, { marked: number; present: number }>();
  for (const r of records) {
    const c = lessonClass.get(r.lessonId) ?? classOf.get(r.studentId);
    if (!c) continue;
    const t = tally.get(c) ?? { marked: 0, present: 0 };
    t.marked++;
    if (isPresent(r.status)) t.present++;
    tally.set(c, t);
  }
  return classes.map((c) => {
    const t = tally.get(c.id) ?? { marked: 0, present: 0 };
    return { classId: c.id, className: c.name, marked: t.marked, present: t.present, rate: t.marked ? t.present / t.marked : null };
  });
}

/** Kunlar bo'yicha davomat foizi (grafik uchun). */
export function attendanceByDay(days: string[], records: AttendanceRecord[]): { day: string; rate: number | null; marked: number }[] {
  const tally = new Map<string, { marked: number; present: number }>();
  for (const r of records) {
    const t = tally.get(r.day) ?? { marked: 0, present: 0 };
    t.marked++;
    if (isPresent(r.status)) t.present++;
    tally.set(r.day, t);
  }
  return days.map((day) => {
    const t = tally.get(day);
    return { day, marked: t?.marked ?? 0, rate: t?.marked ? t.present / t.marked : null };
  });
}

export function gradeAverages(grades: Grade[], key: (g: Grade) => string): { key: string; avg: number | null; count: number }[] {
  const groups = new Map<string, Grade[]>();
  for (const g of grades) {
    if (g.type === "term" || g.type === "year") continue;
    const k = key(g);
    const l = groups.get(k);
    if (l) l.push(g);
    else groups.set(k, [g]);
  }
  return [...groups.entries()].map(([k, gs]) => ({ key: k, avg: weightedAverage(gs), count: gs.length })).sort((a, b) => a.key.localeCompare(b.key));
}

export function billingTotals(invoices: Invoice[]) {
  return {
    total: invoices.reduce((s, i) => s + i.amount, 0),
    paid: invoices.reduce((s, i) => s + invoicePaid(i), 0),
    remaining: invoices.reduce((s, i) => s + invoiceRemaining(i), 0),
    debtors: new Set(invoices.filter((i) => invoiceRemaining(i) > 0).map((i) => i.studentId)).size,
  };
}
