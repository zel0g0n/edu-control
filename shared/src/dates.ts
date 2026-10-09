const pad = (n: number) => String(n).padStart(2, "0");

/** Mahalliy vaqt bo'yicha "YYYY-MM-DD". */
export function dayKey(d: Date | number): string {
  const x = typeof d === "number" ? new Date(d) : d;
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

export function parseDay(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, n: number): string {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/** 1 = Dushanba ... 7 = Yakshanba */
export function isoWeekday(d: Date | string | number): number {
  const x = typeof d === "string" ? parseDay(d) : new Date(d);
  return x.getDay() === 0 ? 7 : x.getDay();
}

export function monthKey(d: Date | number): string {
  const x = typeof d === "number" ? new Date(d) : d;
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}`;
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + n, 1));
}

/** "08:30" -> 510 */
export function toMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

/** Kun + "HH:MM" -> epoch ms (mahalliy vaqt). */
export function atTime(day: string, hm: string): number {
  const d = parseDay(day);
  const m = toMinutes(hm);
  d.setHours(Math.floor(m / 60), m % 60, 0, 0);
  return d.getTime();
}

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Epoch ms -> "HH:MM" (mahalliy vaqt). */
export function hm(t: number): string {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
