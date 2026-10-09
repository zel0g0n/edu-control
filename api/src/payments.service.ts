import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHash, timingSafeEqual } from "node:crypto";
import { invoiceRemaining, onlinePaymentPatch, type Invoice } from "@edunazorat/shared";

import { CONFIG, type Config } from "./config";
import { SQL, type Sql } from "./db/sql";
import { StoreService } from "./store.service";

const md5 = (s: string) => createHash("md5").update(s).digest("hex");
const safeEq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// ---------------------------------------------------------------- Click (SHOP API)

export interface ClickRequest {
  click_trans_id: string;
  service_id: string;
  click_paydoc_id?: string;
  merchant_trans_id: string;
  merchant_prepare_id?: string;
  amount: string;
  action: string;
  error: string;
  error_note?: string;
  sign_time: string;
  sign_string: string;
}

// ---------------------------------------------------------------- Payme (Merchant API)

const PAYME_TIMEOUT = 12 * 3600_000;
const msg = (uz: string, ru: string, en: string) => ({ uz, ru, en });
class PaymeError extends Error {
  constructor(readonly code: number, readonly text: { uz: string; ru: string; en: string }, readonly data?: string) {
    super(text.en);
  }
}
interface PaymeTx { id: string; invoice_id: string; amount: string | number; state: number; create_time: string | number; perform_time: string | number; cancel_time: string | number; reason: number | null }

/**
 * Onlayn to'lovlarni qabul qilish. Kalitlar muhit o'zgaruvchilarida
 * (CLICK_SECRET_KEY, PAYME_KEY): ular hech qachon brauzerga yuborilmaydi.
 * Bitta server = bitta merchant (maktab o'z serverida yoki bitta bulut).
 */
@Injectable()
export class PaymentsService {
  private readonly log = new Logger("Payments");

  constructor(@Inject(CONFIG) private readonly config: Config, @Inject(SQL) private readonly sql: Sql, @Inject(StoreService) private readonly store: StoreService) {}

  private invoice(id: string): Invoice | undefined {
    return this.store.db.invoices.find((i) => i.id === id);
  }

  // ------------------------------------------------------------ Click

  async click(r: ClickRequest, stage: "prepare" | "complete") {
    const base = { click_trans_id: r.click_trans_id, merchant_trans_id: r.merchant_trans_id };
    const fail = (error: number, note: string) => ({ ...base, error, error_note: note });
    const key = this.config.clickSecretKey;
    if (!key) return fail(-8, "Click ulanmagan");
    if (this.config.clickServiceId && r.service_id !== this.config.clickServiceId) return fail(-8, "service_id");
    const action = stage === "prepare" ? "0" : "1";
    if (r.action !== action) return fail(-3, "Action not found");
    const signSrc = stage === "prepare"
      ? `${r.click_trans_id}${r.service_id}${key}${r.merchant_trans_id}${r.amount}${r.action}${r.sign_time}`
      : `${r.click_trans_id}${r.service_id}${key}${r.merchant_trans_id}${r.merchant_prepare_id ?? ""}${r.amount}${r.action}${r.sign_time}`;
    if (!r.sign_string || !safeEq(md5(signSrc), String(r.sign_string).toLowerCase())) return fail(-1, "SIGN CHECK FAILED!");
    const inv = this.invoice(r.merchant_trans_id);
    if (!inv) return fail(-5, "Invoice not found");
    const amount = Math.round(Number(r.amount));
    const [tx] = await this.sql.query<{ state: string; amount: string }>("SELECT state, amount FROM click_transactions WHERE click_trans_id = $1", [r.click_trans_id]);

    if (stage === "prepare") {
      if (tx?.state === "done") return fail(-4, "Already paid");
      if (invoiceRemaining(inv) <= 0) return fail(-4, "Already paid");
      if (!(amount > 0) || amount > invoiceRemaining(inv)) return fail(-2, "Incorrect parameter amount");
      await this.sql.query(
        "INSERT INTO click_transactions (click_trans_id, invoice_id, amount, state) VALUES ($1, $2, $3, 'prepared') ON CONFLICT (click_trans_id) DO NOTHING",
        [r.click_trans_id, inv.id, amount]);
      return { ...base, merchant_prepare_id: r.click_trans_id, error: 0, error_note: "Success" };
    }

    if (!tx || r.merchant_prepare_id !== r.click_trans_id) return fail(-6, "Transaction does not exist");
    if (tx.state === "done") return { ...base, merchant_confirm_id: r.click_trans_id, error: -4, error_note: "Already paid" };
    if (tx.state === "cancelled") return fail(-9, "Transaction cancelled");
    if (Number(r.error) < 0) {
      await this.sql.query("UPDATE click_transactions SET state = 'cancelled' WHERE click_trans_id = $1", [r.click_trans_id]);
      return fail(-9, "Transaction cancelled");
    }
    if (Number(tx.amount) !== amount) return fail(-2, "Incorrect parameter amount");
    await this.store.applySystem("payment.click", (db) => onlinePaymentPatch(db, inv.id, amount, "click", `click:${r.click_trans_id}`, this.store.clock()));
    await this.sql.query("UPDATE click_transactions SET state = 'done' WHERE click_trans_id = $1", [r.click_trans_id]);
    this.log.log(`Click to'lov: ${inv.id} ${amount}`);
    return { ...base, merchant_confirm_id: r.click_trans_id, error: 0, error_note: "Success" };
  }

  // ------------------------------------------------------------ Payme

  paymeAuthorized(header: string | undefined): boolean {
    const keys = [this.config.paymeKey, this.config.paymeTestKey].filter((k): k is string => !!k);
    if (!header?.startsWith("Basic ") || keys.length === 0) return false;
    const decoded = Buffer.from(header.slice(6), "base64").toString();
    return keys.some((k) => safeEq(decoded, `Paycom:${k}`));
  }

  async payme(body: { id?: unknown; method?: string; params?: Record<string, unknown> }, authorized: boolean) {
    const id = body?.id ?? null;
    try {
      if (!authorized) throw new PaymeError(-32504, msg("Ruxsat yo'q", "Недостаточно привилегий", "Insufficient privilege"));
      const result = await this.paymeMethod(body.method ?? "", body.params ?? {});
      return { jsonrpc: "2.0", id, result };
    } catch (e) {
      if (e instanceof PaymeError) return { jsonrpc: "2.0", id, error: { code: e.code, message: e.text, data: e.data } };
      this.log.error(e instanceof Error ? e.stack : String(e));
      return { jsonrpc: "2.0", id, error: { code: -32400, message: msg("Tizim xatosi", "Системная ошибка", "System error") } };
    }
  }

  private accountInvoice(params: Record<string, unknown>): Invoice {
    const field = this.store.db.institutions[0]?.settings.payments.paymeAccountField || "order_id";
    const acc = (params.account ?? {}) as Record<string, unknown>;
    const inv = this.invoice(String(acc[field] ?? acc.order_id ?? ""));
    if (!inv) throw new PaymeError(-31050, msg("Hisob-varaq topilmadi", "Счёт не найден", "Invoice not found"), field);
    return inv;
  }

  private checkAmount(inv: Invoice, tiyin: unknown) {
    const amount = Number(tiyin) / 100;
    const rem = invoiceRemaining(inv);
    if (rem <= 0) throw new PaymeError(-31051, msg("Bu oy to'langan", "Счёт уже оплачен", "Already paid"), "order_id");
    if (!Number.isFinite(amount) || amount <= 0 || amount > rem) throw new PaymeError(-31001, msg("Summa noto'g'ri", "Неверная сумма", "Incorrect amount"));
    return amount;
  }

  private txResult(t: PaymeTx) {
    return {
      create_time: Number(t.create_time), perform_time: Number(t.perform_time), cancel_time: Number(t.cancel_time),
      transaction: t.id, state: t.state, reason: t.reason ?? null,
    };
  }

  private async tx(id: unknown): Promise<PaymeTx> {
    const [t] = await this.sql.query<PaymeTx>("SELECT * FROM payme_transactions WHERE id = $1", [String(id)]);
    if (!t) throw new PaymeError(-31003, msg("Tranzaksiya topilmadi", "Транзакция не найдена", "Transaction not found"));
    return t;
  }

  private async paymeMethod(method: string, p: Record<string, unknown>) {
    const now = this.store.clock();
    switch (method) {
      case "CheckPerformTransaction": {
        const inv = this.accountInvoice(p);
        this.checkAmount(inv, p.amount);
        return { allow: true };
      }
      case "CreateTransaction": {
        const [existing] = await this.sql.query<PaymeTx>("SELECT * FROM payme_transactions WHERE id = $1", [String(p.id)]);
        if (existing) {
          if (existing.state !== 1) throw new PaymeError(-31008, msg("Amalni bajarib bo'lmaydi", "Невозможно выполнить операцию", "Unable to perform"));
          if (now - Number(existing.create_time) > PAYME_TIMEOUT) {
            await this.sql.query("UPDATE payme_transactions SET state = -1, cancel_time = $2, reason = 4 WHERE id = $1", [existing.id, now]);
            throw new PaymeError(-31008, msg("Muddat o'tdi", "Время истекло", "Timed out"));
          }
          return { create_time: Number(existing.create_time), transaction: existing.id, state: 1 };
        }
        const inv = this.accountInvoice(p);
        this.checkAmount(inv, p.amount);
        const [busy] = await this.sql.query<PaymeTx>("SELECT * FROM payme_transactions WHERE invoice_id = $1 AND state = 1", [inv.id]);
        if (busy) throw new PaymeError(-31050, msg("Hisob-varaq bo'yicha boshqa to'lov kutilmoqda", "Счёт ожидает другой оплаты", "Invoice is busy"), "order_id");
        const create = Number(p.time) || now;
        await this.sql.query("INSERT INTO payme_transactions (id, invoice_id, amount, state, create_time) VALUES ($1, $2, $3, 1, $4)", [String(p.id), inv.id, Number(p.amount), create]);
        return { create_time: create, transaction: String(p.id), state: 1 };
      }
      case "PerformTransaction": {
        const t = await this.tx(p.id);
        if (t.state === 2) return { transaction: t.id, perform_time: Number(t.perform_time), state: 2 };
        if (t.state !== 1) throw new PaymeError(-31008, msg("Amalni bajarib bo'lmaydi", "Невозможно выполнить операцию", "Unable to perform"));
        if (now - Number(t.create_time) > PAYME_TIMEOUT) {
          await this.sql.query("UPDATE payme_transactions SET state = -1, cancel_time = $2, reason = 4 WHERE id = $1", [t.id, now]);
          throw new PaymeError(-31008, msg("Muddat o'tdi", "Время истекло", "Timed out"));
        }
        await this.store.applySystem("payment.payme", (db) => onlinePaymentPatch(db, t.invoice_id, Number(t.amount) / 100, "payme", `payme:${t.id}`, now));
        await this.sql.query("UPDATE payme_transactions SET state = 2, perform_time = $2 WHERE id = $1", [t.id, now]);
        this.log.log(`Payme to'lov: ${t.invoice_id} ${Number(t.amount) / 100}`);
        return { transaction: t.id, perform_time: now, state: 2 };
      }
      case "CancelTransaction": {
        const t = await this.tx(p.id);
        if (t.state < 0) return { transaction: t.id, cancel_time: Number(t.cancel_time), state: t.state };
        const state = t.state === 2 ? -2 : -1;
        if (t.state === 2) {
          // Qaytarish: to'lov yozuvini hisob-varaqdan olib tashlaymiz.
          await this.store.applySystem("payment.payme.cancel", (db) => {
            const inv = db.invoices.find((i) => i.id === t.invoice_id);
            return inv ? { upsert: { invoices: [{ ...inv, payments: inv.payments.filter((x) => x.externalId !== `payme:${t.id}`) }] } } : {};
          });
        }
        await this.sql.query("UPDATE payme_transactions SET state = $2, cancel_time = $3, reason = $4 WHERE id = $1", [t.id, state, now, Number(p.reason) || null]);
        return { transaction: t.id, cancel_time: now, state };
      }
      case "CheckTransaction":
        return this.txResult(await this.tx(p.id));
      case "GetStatement": {
        const rows = await this.sql.query<PaymeTx>("SELECT * FROM payme_transactions WHERE create_time BETWEEN $1 AND $2 ORDER BY create_time", [Number(p.from), Number(p.to)]);
        return {
          transactions: rows.map((t) => ({
            id: t.id, time: Number(t.create_time), amount: Number(t.amount), account: { order_id: t.invoice_id },
            create_time: Number(t.create_time), perform_time: Number(t.perform_time), cancel_time: Number(t.cancel_time), transaction: t.id, state: t.state, reason: t.reason ?? null,
          })),
        };
      }
      default:
        throw new PaymeError(-32601, msg("Usul topilmadi", "Метод не найден", "Method not found"));
    }
  }
}
