import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { CommandError, findLoginUser, normalizePhone, type AppUser } from "@edunazorat/shared";

import { SQL, type Sql } from "../db/sql";
import { LimitsService } from "../limits.service";
import { StoreService } from "../store.service";
import { SmsService } from "./sms.service";

const TTL_S = 5 * 60;
const RESEND_S = 60;
const MAX_ATTEMPTS = 5;
const hash = (phone: string, code: string) => createHash("sha256").update(`${phone}:${code}`).digest("hex");

/**
 * Bir martalik SMS kod: 6 raqam, 5 daqiqa, 5 urinish, 60 soniyada bir marta.
 * Kod (faqat xeshi) va xato urinishlar bazada: istalgan server nusxasida tekshiriladi.
 */
@Injectable()
export class OtpService {
  constructor(
    @Inject(StoreService) private readonly store: StoreService,
    @Inject(SmsService) private readonly sms: SmsService,
    @Inject(SQL) private readonly sql: Sql,
    @Inject(LimitsService) private readonly limits: LimitsService,
  ) {}

  async request(rawPhone: string): Promise<{ devCode?: string }> {
    const phone = normalizePhone(rawPhone);
    if (!phone) throw new CommandError("err.phone", { phone: rawPhone }, 400);
    findLoginUser(this.store.db, phone);
    await this.blocked(phone);
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    // 60 soniyada bir marta (bazada atomar: ikki nusxa bir vaqtda yubormaydi)
    const rows = await this.sql.query<{ phone: string }>(
      `INSERT INTO otp_codes (phone, hash, expires_at, attempts, sent_at) VALUES ($1, $2, now() + make_interval(secs => $3), 0, now())
       ON CONFLICT (phone) DO UPDATE SET hash = EXCLUDED.hash, expires_at = EXCLUDED.expires_at, attempts = 0, sent_at = now()
         WHERE otp_codes.sent_at < now() - make_interval(secs => $4)
       RETURNING phone`,
      [phone, hash(phone, code), TTL_S, RESEND_S],
    );
    if (!rows.length) {
      const [p] = await this.sql.query<{ wait: string | number }>("SELECT extract(epoch FROM (sent_at + make_interval(secs => $2) - now())) AS wait FROM otp_codes WHERE phone = $1", [phone, RESEND_S]);
      throw new CommandError("err.otpWait", { s: Math.max(1, Math.ceil(Number(p?.wait ?? RESEND_S))) }, 429);
    }
    await this.sms.send(phone, `EduControl: kirish kodi ${code}. Kodni hech kimga bermang.`);
    return this.sms.devMode ? { devCode: code } : {};
  }

  async verify(rawPhone: string, code: string): Promise<AppUser> {
    const phone = normalizePhone(rawPhone);
    if (!phone) throw new CommandError("err.phone", { phone: rawPhone }, 400);
    await this.blocked(phone);
    const [p] = await this.sql.query<{ hash: string; attempts: number }>("SELECT hash, attempts FROM otp_codes WHERE phone = $1 AND expires_at > now()", [phone]);
    if (!p) throw new CommandError("err.otpExpired", {}, 401);
    const want = Buffer.from(p.hash);
    const ok = /^\d{6}$/.test(code) && timingSafeEqual(want, Buffer.from(hash(phone, code)));
    if (!ok) {
      // Raqam bo'yicha xato urinishlar (kod qayta so'ralsa ham saqlanadi): 15 daqiqada 10 ta → blok
      await this.limits.hit(`otpfail:${phone}`, 15 * 60);
      const [a] = await this.sql.query<{ attempts: number }>("UPDATE otp_codes SET attempts = attempts + 1 WHERE phone = $1 RETURNING attempts", [phone]);
      if (a && a.attempts >= MAX_ATTEMPTS) await this.sql.query("DELETE FROM otp_codes WHERE phone = $1", [phone]);
      throw new CommandError("err.otp", {}, 401);
    }
    // Kod bir marta ishlaydi (ikki nusxa bir vaqtda tekshirsa ham)
    const used = await this.sql.query<{ phone: string }>("DELETE FROM otp_codes WHERE phone = $1 AND hash = $2 RETURNING phone", [phone, p.hash]);
    if (!used.length) throw new CommandError("err.otpExpired", {}, 401);
    await this.limits.clear(`otpfail:${phone}`);
    return findLoginUser(this.store.db, phone);
  }

  private async blocked(phone: string) {
    const f = await this.limits.peek(`otpfail:${phone}`);
    if (f.n >= MAX_ATTEMPTS * 2) throw new CommandError("err.otpBlocked", { m: Math.ceil(f.wait / 60) }, 429);
  }
}
