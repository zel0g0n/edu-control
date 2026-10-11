import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { CommandError } from "@edunazorat/shared";

import { CONFIG, type Config } from "./config";
import { SQL, type Sql } from "./db/sql";

interface Rule { windowS: number; max: number; maxAmount?: number }

/**
 * So'rovlar cheklovi va xato urinishlar hisobi. Hisoblagichlar Postgres'da: bir nechta server
 * nusxasi bo'lsa ham cheklov umumiy (bitta nusxani aylanib o'tib bo'lmaydi).
 */
@Injectable()
export class LimitsService implements OnModuleInit, OnModuleDestroy {
  private readonly rules: Record<string, Rule>;
  private cleanup: NodeJS.Timeout | null = null;

  /** scale: testlarda cheklovlarni kengaytirish uchun (RATE_LIMIT_SCALE). */
  constructor(@Inject(SQL) private readonly sql: Sql, @Inject(CONFIG) config: Pick<Config, "rateLimitScale">) {
    const k = Math.max(1, config.rateLimitScale);
    this.rules = {
      login: { windowS: 600, max: 30 * k },
      otp: { windowS: 600, max: 10 * k },
      cmd: { windowS: 60, max: 300 * k },
      ticket: { windowS: 60, max: 30 * k },
      mfa: { windowS: 600, max: 10 * k },
      upH: { windowS: 3600, max: 30 * k },
      upD: { windowS: 86_400, max: 200 * k, maxAmount: 50 * 1024 * 1024 * k },
    };
  }

  onModuleInit() {
    this.cleanup = setInterval(() => void this.sql.query("DELETE FROM rate_limits WHERE reset_at < now() - interval '1 hour'").catch(() => undefined), 600_000);
    this.cleanup.unref();
  }

  onModuleDestroy() {
    if (this.cleanup) clearInterval(this.cleanup);
  }

  /** Hisoblagichni oshiradi; oyna ichidagi soni va qolgan vaqt (s). */
  async hit(key: string, windowS: number, amount = 0): Promise<{ n: number; amount: number; wait: number }> {
    const [r] = await this.sql.query<{ n: number; amount: string | number; wait: string | number }>(
      `INSERT INTO rate_limits (key, reset_at, n, amount) VALUES ($1, now() + make_interval(secs => $2), 1, $3)
       ON CONFLICT (key) DO UPDATE SET
         n = CASE WHEN rate_limits.reset_at <= now() THEN 1 ELSE rate_limits.n + 1 END,
         amount = CASE WHEN rate_limits.reset_at <= now() THEN EXCLUDED.amount ELSE rate_limits.amount + EXCLUDED.amount END,
         reset_at = CASE WHEN rate_limits.reset_at <= now() THEN EXCLUDED.reset_at ELSE rate_limits.reset_at END
       RETURNING n, amount, extract(epoch FROM (reset_at - now())) AS wait`,
      [key.slice(0, 200), windowS, amount],
    );
    return { n: Number(r.n), amount: Number(r.amount), wait: Math.max(1, Math.ceil(Number(r.wait))) };
  }

  /** Oshirmasdan: oyna ichidagi soni. */
  async peek(key: string): Promise<{ n: number; wait: number }> {
    const [r] = await this.sql.query<{ n: number; wait: string | number }>(
      "SELECT n, extract(epoch FROM (reset_at - now())) AS wait FROM rate_limits WHERE key = $1 AND reset_at > now()", [key.slice(0, 200)]);
    return r ? { n: Number(r.n), wait: Math.max(1, Math.ceil(Number(r.wait))) } : { n: 0, wait: 0 };
  }

  async clear(key: string): Promise<void> {
    await this.sql.query("DELETE FROM rate_limits WHERE key = $1", [key.slice(0, 200)]);
  }

  private async check(rule: string, key: string, amount = 0) {
    const r = this.rules[rule];
    const h = await this.hit(`${rule}:${key}`, r.windowS, amount);
    if (h.n > r.max || (r.maxAmount !== undefined && h.amount > r.maxAmount)) throw new CommandError("err.tooMany", { s: h.wait }, 429);
  }

  loginAttempt(ip: string) { return this.check("login", ip); }
  otpRequest(ip: string) { return this.check("otp", ip); }
  command(userId: string) { return this.check("cmd", userId); }
  ticket(userId: string) { return this.check("ticket", userId); }
  mfaAttempt(userId: string) { return this.check("mfa", userId); }
  async upload(userId: string, bytes: number) {
    await this.check("upH", userId);
    await this.check("upD", userId, bytes);
  }
}
