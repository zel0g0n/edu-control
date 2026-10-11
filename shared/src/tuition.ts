// O'quv to'lovi hisobi: guruh to'lov turi, oy o'rtasida qo'shilish/chiqish,
// qoldirilgan darslar uchun chegirma. Maktabda (oylik, chegirmasiz) natija = sinf narxi.
import { addMonths } from "./dates";
import { classIdsOf } from "./membership";
import type { AttendanceRecord, Enrollment, Invoice, InvoiceLine, Lesson, SchoolClass, Student } from "./types";

/** 1000 so'mgacha yaxlitlash. */
const round = (n: number) => Math.round(n / 1000) * 1000;

function monthDays(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const n = new Date(y, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

/** ISO hafta kuni (1 = Dushanba ... 7 = Yakshanba), vaqt mintaqasiga bog'liq emas. */
function weekday(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 0 ? 7 : w;
}

/** Guruhning shu kunlardagi darslari soni (har hafta takrorlanadigan jadval bo'yicha). */
export function lessonCount(lessons: Lesson[], classId: string, days: string[], off?: Set<string>): number {
  if (off?.size) days = days.filter((d) => !off.has(d));
  const perWeekday = new Map<number, number>();
  for (const l of lessons) if (l.classId === classId) perWeekday.set(l.weekday, (perWeekday.get(l.weekday) ?? 0) + 1);
  return days.reduce((sum, d) => sum + (perWeekday.get(weekday(d)) ?? 0), 0);
}

/** O'quvchi shu guruhda bo'lgan kunlar (oy ichida). Tarix yo'q bo'lsa hozirgi a'zolik = butun oy. */
export function enrolledDays(s: Student, classId: string, month: string): string[] {
  const days = monthDays(month);
  const list = (s.enrollments ?? []).filter((e) => e.classId === classId);
  if (!list.length) return classIdsOf(s).includes(classId) ? days : [];
  const inside = (d: string, e: Enrollment) => (!e.from || d >= e.from) && (!e.to || d < e.to);
  return days.filter((d) => list.some((e) => inside(d, e)));
}

/** Bitta dars qiymati (chegirma uchun): perLesson = dars narxi, monthly = oylik / oydagi darslar. */
export function lessonValue(cls: SchoolClass, lessons: Lesson[], month: string, off?: Set<string>): number {
  if ((cls.billingMode ?? "monthly") === "perLesson") return cls.lessonPrice ?? 0;
  if (cls.billingMode === "course") return 0;
  const n = lessonCount(lessons, cls.id, monthDays(month), off);
  return n ? cls.monthlyFee / n : 0;
}

/** Guruh uchun oy narxi. */
export function groupFee(s: Student, cls: SchoolClass, lessons: Lesson[], month: string, off?: Set<string>): InvoiceLine | null {
  const mode = cls.billingMode ?? "monthly";
  const days = enrolledDays(s, cls.id, month);
  if (!days.length) return null;
  const all = monthDays(month);
  const n = lessonCount(lessons, cls.id, days, off);
  if (mode === "course") {
    // Kurs narxi qo'shilgan oyda bir marta (tarixsiz eski o'quvchiga hisoblanmaydi)
    const e = (s.enrollments ?? []).find((x) => x.classId === cls.id && x.from.startsWith(month));
    return e && cls.coursePrice ? { kind: "fee", classId: cls.id, amount: round(cls.coursePrice) } : null;
  }
  if (mode === "perLesson") {
    return n && cls.lessonPrice ? { kind: "fee", classId: cls.id, amount: round(n * cls.lessonPrice), lessons: n } : null;
  }
  if (!cls.monthlyFee) return null;
  if (days.length === all.length) return { kind: "fee", classId: cls.id, amount: cls.monthlyFee, lessons: lessonCount(lessons, cls.id, all, off) || undefined };
  // Oy o'rtasida qo'shilgan/chiqqan: dars soniga qarab (jadval bo'lmasa kunlar bo'yicha)
  const full = lessonCount(lessons, cls.id, all, off);
  const share = full ? n / full : days.length / all.length;
  return { kind: "fee", classId: cls.id, amount: round(cls.monthlyFee * share), lessons: full ? n : undefined, partial: true };
}

/** O'tgan oyda qoldirilgan darslar uchun chegirma (guruh sozlamasi bo'yicha). */
export function absenceRefund(s: Student, cls: SchoolClass, lessons: Lesson[], attendance: AttendanceRecord[], month: string, off?: Set<string>): InvoiceLine | null {
  const policy = cls.absenceRefund ?? "none";
  if (policy === "none") return null;
  const prev = addMonths(month, -1);
  const ids = new Set(lessons.filter((l) => l.classId === cls.id).map((l) => l.id));
  const missed = attendance.filter((a) => a.studentId === s.id && ids.has(a.lessonId) && a.day.startsWith(prev)
    && (a.status === "excused" || (policy === "all" && a.status === "absent"))).length;
  if (!missed) return null;
  const value = lessonValue(cls, lessons, prev, off);
  const amount = round(missed * value);
  return amount ? { kind: "absenceRefund", classId: cls.id, amount: -amount, lessons: missed } : null;
}

export interface TuitionInput {
  classes: SchoolClass[];
  lessons: Lesson[];
  attendance: AttendanceRecord[];
  /** Dam olish kunlari (holidayDays). */
  holidays?: Set<string>;
}

/** O'quvchining oy uchun hisobi: guruhlar narxi + chegirmalar. */
export function tuitionFor(s: Student, month: string, input: TuitionInput): { amount: number; lines: InvoiceLine[] } {
  // Shu oyda a'zo bo'lgan barcha guruhlar (oy davomida chiqqanlari ham)
  const ids = new Set([...classIdsOf(s), ...(s.enrollments ?? []).map((e) => e.classId)]);
  const lines: InvoiceLine[] = [];
  for (const id of ids) {
    const cls = input.classes.find((c) => c.id === id);
    if (!cls) continue;
    const fee = groupFee(s, cls, input.lessons, month, input.holidays);
    if (fee) lines.push(fee);
    const refund = absenceRefund(s, cls, input.lessons, input.attendance, month, input.holidays);
    if (refund) lines.push(refund);
  }
  const amount = Math.max(0, lines.reduce((sum, l) => sum + l.amount, 0));
  return { amount, lines };
}

/** Oy uchun hisob-varaqlar: hali hisob-varag'i yo'q faol o'quvchilarga. */
export function buildInvoices(month: string, students: Student[], existing: Invoice[], dueDayOfMonth: number, input: TuitionInput): Omit<Invoice, "id">[] {
  const has = new Set(existing.filter((i) => i.month === month).map((i) => i.studentId));
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const due = `${month}-${String(Math.min(dueDayOfMonth, lastDay)).padStart(2, "0")}`;
  const out: Omit<Invoice, "id">[] = [];
  for (const s of students) {
    if (s.archived || has.has(s.id)) continue;
    const t = tuitionFor(s, month, input);
    if (t.amount <= 0) continue;
    // Bitta guruh, to'liq oy, chegirmasiz (maktab): tafsilot shart emas
    const simple = t.lines.length === 1 && t.lines[0].kind === "fee" && !t.lines[0].partial && (input.classes.find((c) => c.id === t.lines[0].classId)?.billingMode ?? "monthly") === "monthly";
    out.push({ studentId: s.id, month, amount: t.amount, dueDay: due, payments: [], ...(simple ? {} : { lines: t.lines }) });
  }
  return out;
}
