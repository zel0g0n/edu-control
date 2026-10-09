import { isPresent } from "./attendance";
import { invoicePaid, invoiceRemaining } from "./billing";
import { weightedAverage } from "./grades";
import type { AttendanceRecord, Grade, Invoice, SchoolClass, Student } from "./types";

export interface ClassAttendanceRow { classId: string; className: string; marked: number; present: number; rate: number | null }

export function attendanceByClass(classes: SchoolClass[], students: Student[], records: AttendanceRecord[]): ClassAttendanceRow[] {
  const classOf = new Map(students.map((s) => [s.id, s.classId]));
  return classes.map((c) => {
    const rs = records.filter((r) => classOf.get(r.studentId) === c.id);
    const present = rs.filter((r) => isPresent(r.status)).length;
    return { classId: c.id, className: c.name, marked: rs.length, present, rate: rs.length ? present / rs.length : null };
  });
}

/** Kunlar bo'yicha davomat foizi (grafik uchun). */
export function attendanceByDay(days: string[], records: AttendanceRecord[]): { day: string; rate: number | null; marked: number }[] {
  return days.map((day) => {
    const rs = records.filter((r) => r.day === day);
    return { day, marked: rs.length, rate: rs.length ? rs.filter((r) => isPresent(r.status)).length / rs.length : null };
  });
}

export function gradeAverages(grades: Grade[], key: (g: Grade) => string): { key: string; avg: number | null; count: number }[] {
  const groups = new Map<string, Grade[]>();
  for (const g of grades) {
    if (g.type === "term" || g.type === "year") continue;
    const k = key(g);
    groups.set(k, [...(groups.get(k) ?? []), g]);
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
