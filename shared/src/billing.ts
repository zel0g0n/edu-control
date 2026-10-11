import { monthKey } from "./dates";
import { classIdsOf } from "./membership";
import type { Invoice, PaymentProviderSettings, SchoolClass, Student } from "./types";

export function invoicePaid(inv: Invoice): number {
  return inv.payments.reduce((s, p) => s + p.amount, 0);
}

export function invoiceRemaining(inv: Invoice): number {
  return Math.max(0, inv.amount - invoicePaid(inv));
}

export function isOverdue(inv: Invoice, today: string): boolean {
  return invoiceRemaining(inv) > 0 && today > inv.dueDay;
}

/** Oy uchun hisob-varaqlar: hali hisob-varag'i yo'q faol o'quvchilarga, sinf to'lovi bo'yicha. */
export function invoicesToCreate(
  month: string,
  students: Student[],
  classes: SchoolClass[],
  existing: Invoice[],
  dueDayOfMonth: number,
): Omit<Invoice, "id">[] {
  const has = new Set(existing.filter((i) => i.month === month).map((i) => i.studentId));
  const fee = new Map(classes.map((c) => [c.id, c.monthlyFee]));
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const due = `${month}-${String(Math.min(dueDayOfMonth, lastDay)).padStart(2, "0")}`;
  // O'quv markazi: bir nechta guruhdagi o'quvchiga barcha guruhlar narxi yig'indisi
  const total = (s: Student) => classIdsOf(s).reduce((sum, c) => sum + (fee.get(c) ?? 0), 0);
  return students
    .filter((s) => !s.archived && !has.has(s.id) && total(s) > 0)
    .map((s) => ({ studentId: s.id, month, amount: total(s), dueDay: due, payments: [] }));
}

export function currentMonth(now: number): string {
  return monthKey(now);
}

/**
 * Click to'lov sahifasi havolasi (my.click.uz). Merchant ma'lumotlari
 * muassasa sozlamalarida bo'lishi kerak.
 */
export function clickPaymentUrl(cfg: PaymentProviderSettings, invoiceId: string, amount: number, returnUrl?: string): string | null {
  if (!cfg.clickServiceId || !cfg.clickMerchantId) return null;
  const q = new URLSearchParams({
    service_id: cfg.clickServiceId,
    merchant_id: cfg.clickMerchantId,
    amount: String(amount),
    transaction_param: invoiceId,
  });
  if (returnUrl) q.set("return_url", returnUrl);
  return `https://my.click.uz/services/pay?${q.toString()}`;
}

/** Payme checkout havolasi: base64("m=...;ac.<field>=...;a=<tiyin>"). */
export function paymePaymentUrl(cfg: PaymentProviderSettings, invoiceId: string, amount: number, returnUrl?: string): string | null {
  if (!cfg.paymeMerchantId) return null;
  const field = cfg.paymeAccountField || "order_id";
  let params = `m=${cfg.paymeMerchantId};ac.${field}=${invoiceId};a=${Math.round(amount * 100)}`;
  if (returnUrl) params += `;c=${returnUrl}`;
  const b64 = typeof btoa === "function" ? btoa(params) : Buffer.from(params).toString("base64");
  return `https://checkout.paycom.uz/${b64}`;
}

/** Markazda Click yoki Payme ulanganmi (to'lov havolasi yaratib bo'ladimi). */
export function hasOnlinePayments(cfg?: PaymentProviderSettings): boolean {
  return !!cfg && !!(cfg.paymeMerchantId || (cfg.clickServiceId && cfg.clickMerchantId));
}

/**
 * Hisob-varaq uchun to'lov havolalari (Payme/Click o'z sahifasi). Administrator ota-onaga
 * yuboradi yoki QR qilib chop etadi; to'langach tizim hisob-varaqni o'zi yopadi.
 */
export function invoicePaymentLinks(cfg: PaymentProviderSettings | undefined, inv: Invoice): { payme: string | null; click: string | null } {
  const amount = invoiceRemaining(inv);
  if (!cfg || amount <= 0) return { payme: null, click: null };
  return { payme: paymePaymentUrl(cfg, inv.id, amount), click: clickPaymentUrl(cfg, inv.id, amount) };
}
