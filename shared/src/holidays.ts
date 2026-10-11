// Dam olish kunlari (bayramlar, ta'til): bu kunlarda dars bo'lmaydi. To'lov (darsbay, oy o'rtasida
// qo'shilish) va o'qituvchi ulushi hisobida dars soniga kirmaydi; oylik narx o'zgarmaydi.
import type { Holiday, InstitutionSettings } from "./types";

const DAY = 86_400_000;
const toUtc = (d: string) => { const [y, m, x] = d.split("-").map(Number); return Date.UTC(y, m - 1, x); };
const fromUtc = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Barcha dam olish kunlari to'plami (oraliqlar yoyiladi, har biri ko'pi bilan 1 yil). */
export function holidayDays(settings?: Pick<InstitutionSettings, "holidays">): Set<string> {
  const out = new Set<string>();
  for (const h of settings?.holidays ?? []) {
    const a = toUtc(h.from);
    const b = Math.min(toUtc(h.to || h.from), a + 365 * DAY);
    for (let t = a; t <= b; t += DAY) out.add(fromUtc(t));
  }
  return out;
}

/** Shu kun dam olish kunimi (nomi bilan). */
export function holidayOn(settings: Pick<InstitutionSettings, "holidays"> | undefined, day: string): Holiday | undefined {
  return settings?.holidays?.find((h) => day >= h.from && day <= (h.to || h.from));
}

/** O'zbekistondagi asosiy bayramlar (sozlamada bir tugma bilan qo'shish uchun). */
export function uzPublicHolidays(year: number): Omit<Holiday, "id">[] {
  return [
    { from: `${year}-01-01`, to: `${year}-01-01`, name: "Yangi yil" },
    { from: `${year}-03-08`, to: `${year}-03-08`, name: "Xotin-qizlar kuni" },
    { from: `${year}-03-21`, to: `${year}-03-23`, name: "Navro'z" },
    { from: `${year}-05-09`, to: `${year}-05-09`, name: "Xotira va qadrlash kuni" },
    { from: `${year}-09-01`, to: `${year}-09-01`, name: "Mustaqillik kuni" },
    { from: `${year}-10-01`, to: `${year}-10-01`, name: "O'qituvchi va murabbiylar kuni" },
    { from: `${year}-12-08`, to: `${year}-12-08`, name: "Konstitutsiya kuni" },
  ];
}
