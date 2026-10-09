import type { Grade, GradeType } from "./types";

export const GRADE_TYPES: GradeType[] = ["current", "oral", "written", "control", "term", "year"];
export const LESSON_GRADE_TYPES: GradeType[] = ["current", "oral", "written", "control"];

/** Nazorat ishi ikki baravar og'ir hisoblanadi. */
export const GRADE_WEIGHT: Record<GradeType, number> = {
  current: 1, oral: 1, written: 1, control: 2, term: 0, year: 0,
};

/** O'rtacha baho (chorak/yillik baholar hisobga olinmaydi). */
export function weightedAverage(grades: Grade[]): number | null {
  let sum = 0;
  let w = 0;
  for (const g of grades) {
    const k = GRADE_WEIGHT[g.type] ?? 1;
    sum += g.value * k;
    w += k;
  }
  return w === 0 ? null : sum / w;
}

/** Chorak bahosi taklifi: o'rtachani yaxlitlash (4.5 -> 5). O'qituvchi o'zgartirishi mumkin. */
export function suggestTermGrade(avg: number | null): number | null {
  if (avg === null) return null;
  return Math.min(5, Math.max(2, Math.floor(avg + 0.5)));
}

export function isValidGrade(v: number): boolean {
  return Number.isInteger(v) && v >= 2 && v <= 5;
}
