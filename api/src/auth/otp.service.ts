import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { CommandError, findLoginUser, normalizePhone, type AppUser } from "@edunazorat/shared";

import { StoreService } from "../store.service";
import { SmsService } from "./sms.service";

interface Pending { hash: Buffer; expires: number; attempts: number; sentAt: number }

const TTL = 5 * 60_000;
const RESEND = 60_000;
const MAX_ATTEMPTS = 5;
const hash = (phone: string, code: string) => createHash("sha256").update(`${phone}:${code}`).digest();

/** Bir martalik SMS kod: 4 raqam, 5 daqiqa, 5 urinish, 60 soniyada bir marta. */
@Injectable()
export class OtpService {
  private pending = new Map<string, Pending>();
  /** Raqam bo'yicha xato urinishlar (kod qayta so'ralsa ham saqlanadi): 15 daqiqa bloklash. */
  private failures = new Map<string, { count: number; until: number }>();

  constructor(@Inject(StoreService) private readonly store: StoreService, @Inject(SmsService) private readonly sms: SmsService) {}

  async request(rawPhone: string): Promise<{ devCode?: string }> {
    const phone = normalizePhone(rawPhone);
    if (!phone) throw new CommandError("err.phone", { phone: rawPhone }, 400);
    findLoginUser(this.store.db, phone);
    const now = this.store.clock();
    this.blocked(phone, now);
    const prev = this.pending.get(phone);
    if (prev && now - prev.sentAt < RESEND) throw new CommandError("err.otpWait", { s: Math.ceil((RESEND - (now - prev.sentAt)) / 1000) }, 429);
    const code = String(randomInt(0, 10000)).padStart(4, "0");
    this.pending.set(phone, { hash: hash(phone, code), expires: now + TTL, attempts: 0, sentAt: now });
    await this.sms.send(phone, `EduNazorat: kirish kodi ${code}. Kodni hech kimga bermang.`);
    return this.sms.devMode ? { devCode: code } : {};
  }

  verify(rawPhone: string, code: string): AppUser {
    const phone = normalizePhone(rawPhone);
    if (!phone) throw new CommandError("err.phone", { phone: rawPhone }, 400);
    const now = this.store.clock();
    this.blocked(phone, now);
    const p = this.pending.get(phone);
    if (!p || p.expires < now) throw new CommandError("err.otpExpired", {}, 401);
    const ok = /^\d{4}$/.test(code) && timingSafeEqual(p.hash, hash(phone, code));
    if (!ok) {
      p.attempts++;
      const f = this.failures.get(phone) ?? { count: 0, until: 0 };
      f.count++;
      if (f.count >= MAX_ATTEMPTS * 2) f.until = now + 15 * 60_000;
      this.failures.set(phone, f);
      if (p.attempts >= MAX_ATTEMPTS) this.pending.delete(phone);
      throw new CommandError("err.otp", {}, 401);
    }
    this.pending.delete(phone);
    this.failures.delete(phone);
    return findLoginUser(this.store.db, phone);
  }

  private blocked(phone: string, now: number) {
    const f = this.failures.get(phone);
    if (f && f.until > now) throw new CommandError("err.otpBlocked", { m: Math.ceil((f.until - now) / 60000) }, 429);
  }
}
