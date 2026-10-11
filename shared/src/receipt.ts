// Kvitansiya ID: o'quvchining odam o'qiy oladigan 6 xonali raqami.
// Ota-ona uni administratorga aytadi, Click/Payme ilovasida to'lovda kiritadi,
// kvitansiyada chop etiladi. Butun tizim bo'yicha takrorlanmaydi.
import { invoiceRemaining } from "./billing";
import type { Database, Invoice, Student } from "./types";

export const RECEIPT_ID_RE = /^[1-9]\d{5}$/;

/** Kiritilgan matndan raqamni ajratadi ("104 523", "№104523" → "104523"). */
export function parseReceiptId(raw: string): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return RECEIPT_ID_RE.test(digits) ? digits : null;
}

/** Ko'rsatish uchun: "104 523" (aytish va yozib olish oson). */
export function formatReceiptId(id?: string): string {
  return id && RECEIPT_ID_RE.test(id) ? `${id.slice(0, 3)} ${id.slice(3)}` : "—";
}

/** Band bo'lmagan yangi raqam. */
export function newReceiptId(used: Set<string>, rnd: () => number = Math.random): string {
  for (let i = 0; i < 1000; i++) {
    const id = String(100000 + Math.floor(rnd() * 900000));
    if (!used.has(id)) return id;
  }
  // 900 ming raqamning deyarli hammasi band bo'lgandagina: ketma-ket qidirish
  for (let n = 100000; n <= 999999; n++) if (!used.has(String(n))) return String(n);
  throw new Error("Kvitansiya ID tugadi");
}

export function usedReceiptIds(db: Pick<Database, "students">): Set<string> {
  return new Set(db.students.map((s) => s.receiptId).filter((x): x is string => !!x));
}

/**
 * Raqami yo'q (eski) o'quvchilarga raqam beradi. O'zgargan o'quvchilarni qaytaradi
 * (bazaga yozish uchun); bo'sh ro'yxat = hammasida bor.
 */
export function assignMissingReceiptIds(db: Pick<Database, "students">, rnd: () => number = Math.random): Student[] {
  const used = usedReceiptIds(db);
  const changed: Student[] = [];
  for (const s of db.students) {
    if (s.receiptId && RECEIPT_ID_RE.test(s.receiptId)) continue;
    const receiptId = newReceiptId(used, rnd);
    used.add(receiptId);
    changed.push({ ...s, receiptId });
  }
  return changed;
}

export function studentByReceiptId(db: Pick<Database, "students">, raw: string): Student | undefined {
  const id = parseReceiptId(raw);
  return id ? db.students.find((s) => s.receiptId === id) : undefined;
}

/**
 * To'lov tizimidan kelgan hisob raqami: hisob-varaq ID'si yoki Kvitansiya ID.
 * Kvitansiya ID bo'lsa, o'quvchining eng eski to'lanmagan hisob-varag'i olinadi.
 */
export function invoiceForAccount(db: Pick<Database, "students" | "invoices">, account: string): Invoice | undefined {
  const direct = db.invoices.find((i) => i.id === account);
  if (direct) return direct;
  const s = studentByReceiptId(db, account);
  if (!s) return undefined;
  return db.invoices
    .filter((i) => i.studentId === s.id && invoiceRemaining(i) > 0)
    .sort((a, b) => a.month.localeCompare(b.month))[0];
}
