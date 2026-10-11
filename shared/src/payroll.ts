// O'qituvchi ulushi: oy bo'yicha o'tilgan darslar va guruhlardan tushgan pul.
// Foiz: guruh hisob-varaqlaridan tushgan pul × o'qituvchining shu guruhdagi dars ulushi × foiz.
import { invoicePaid } from "./billing";
import type { AppUser, AttendanceRecord, Invoice, Lesson, Student } from "./types";

const round = (n: number) => Math.round(n / 1000) * 1000;

function monthDays(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const n = new Date(y, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

function weekday(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 0 ? 7 : w;
}

export interface PayrollGroup {
  classId: string;
  /** O'qituvchining guruhdagi darslar ulushi (0..1). */
  share: number;
  /** Shu oy hisob-varaqlaridan guruhga tushgan pul. */
  collected: number;
}

export interface PayrollRow {
  teacherId: string;
  mode?: "percent" | "perLesson" | "fixed";
  value?: number;
  /** Jadval bo'yicha shu oydagi darslar (bugungacha). */
  scheduled: number;
  /** Davomat olingan (o'tilgan) darslar. */
  conducted: number;
  /** Foiz uchun asos: o'qituvchi ulushiga to'g'ri keladigan tushgan pul. */
  base: number;
  payout: number;
  groups: PayrollGroup[];
}

export interface PayrollInput {
  lessons: Lesson[];
  attendance: AttendanceRecord[];
  invoices: Invoice[];
  students: Student[];
  /** Dam olish kunlari: jadvaldagi darslar soniga kirmaydi. */
  holidays?: Set<string>;
}

/** Hisob-varaqdagi summaning guruhlarga bo'linishi (tafsilot bo'lmasa: asosiy guruh). */
function invoiceByGroup(inv: Invoice, students: Map<string, Student>): Map<string, number> {
  const out = new Map<string, number>();
  if (inv.lines?.length) {
    for (const l of inv.lines) out.set(l.classId, (out.get(l.classId) ?? 0) + l.amount);
  } else {
    const s = students.get(inv.studentId);
    if (s) out.set(s.classId, inv.amount);
  }
  return out;
}

/** Davomat olingan darslar (dars|kun): har o'qituvchi uchun qayta hisoblamaslik (bitta ro'yxat — bitta to'plam). */
const heldCache = new WeakMap<object, Map<string, Set<string>>>();
function heldSlots(attendance: PayrollInput["attendance"], month: string): Set<string> {
  let byMonth = heldCache.get(attendance);
  if (!byMonth) heldCache.set(attendance, (byMonth = new Map()));
  let set = byMonth.get(month);
  if (!set) {
    set = new Set(attendance.filter((a) => a.day.startsWith(month)).map((a) => `${a.lessonId}|${a.day}`));
    byMonth.set(month, set);
  }
  return set;
}

export function payrollFor(teacher: AppUser, month: string, today: string, input: PayrollInput): PayrollRow {
  const mine = input.lessons.filter((l) => l.teacherId === teacher.id);
  const days = monthDays(month).filter((d) => d <= today && !input.holidays?.has(d));
  const held = heldSlots(input.attendance, month);
  let scheduled = 0;
  let conducted = 0;
  for (const d of days) {
    const wd = weekday(d);
    for (const l of mine) {
      if (l.weekday !== wd) continue;
      scheduled++;
      if (held.has(`${l.id}|${d}`)) conducted++;
    }
  }

  // Guruhlar va o'qituvchi ulushi (haftalik jadvaldagi darslari bo'yicha)
  const classIds = [...new Set(mine.map((l) => l.classId))];
  const students = new Map(input.students.map((s) => [s.id, s]));
  const groups: PayrollGroup[] = classIds.map((classId) => {
    const all = input.lessons.filter((l) => l.classId === classId).length;
    const share = all ? mine.filter((l) => l.classId === classId).length / all : 0;
    let collected = 0;
    for (const inv of input.invoices) {
      if (inv.month !== month || inv.amount <= 0) continue;
      const part = invoiceByGroup(inv, students).get(classId);
      if (!part) continue;
      collected += part * Math.min(1, invoicePaid(inv) / inv.amount);
    }
    return { classId, share, collected: Math.round(collected) };
  });
  const base = Math.round(groups.reduce((s, g) => s + g.collected * g.share, 0));

  const pay = teacher.pay;
  let payout = 0;
  if (pay?.mode === "percent") payout = round((base * pay.value) / 100);
  else if (pay?.mode === "perLesson") payout = conducted * pay.value;
  else if (pay?.mode === "fixed") payout = pay.value;
  return { teacherId: teacher.id, mode: pay?.mode, value: pay?.value, scheduled, conducted, base, payout, groups };
}
