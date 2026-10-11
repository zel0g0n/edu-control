import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import {
  CommandError, DEMO_ACCOUNTS, DEMO_PASSWORD, canManageCredentials, checkNewPassword, findUserByLogin, generatePassword, loginOf,
  type AppUser,
} from "@edunazorat/shared";

import { CONFIG, type Config } from "../config";
import { SQL, type Sql } from "../db/sql";
import { ClusterService } from "../cluster.service";
import { LimitsService } from "../limits.service";
import { StoreService } from "../store.service";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number }) => Promise<Buffer>;
const PARAMS = { N: 16384, r: 8, p: 1 };

/** "scrypt$N$r$p$salt$hash" (base64). */
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const h = await scrypt(pw, salt, 32, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64")}$${h.toString("base64")}`;
}

async function verifyHash(pw: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const want = Buffer.from(hash, "base64");
  const got = await scrypt(pw, Buffer.from(salt, "base64"), want.length, { N: Number(n), r: Number(r), p: Number(p) });
  return got.length === want.length && timingSafeEqual(got, want);
}

interface Row { user_id: string; hash: string; must_change: boolean; token_ver: number }

/**
 * Parollar: alohida jadvalda, faqat xesh (scrypt). Mijozga hech qachon yuborilmaydi.
 * Parol tiklanganda token versiyasi oshadi: eski sessiyalar bekor bo'ladi.
 */
@Injectable()
export class CredentialsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("Credentials");
  /** user_id → token versiyasi (har so'rovda bazaga bormaslik uchun). */
  private versions = new Map<string, number>();
  private reloadTimer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(SQL) private readonly sql: Sql,
    @Inject(StoreService) private readonly store: StoreService,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(LimitsService) private readonly limits: LimitsService,
    @Inject(ClusterService) private readonly cluster: ClusterService,
  ) {}

  async onModuleInit() {
    await this.store.ready;
    await this.reloadVersions();
    // Boshqa nusxada parol tiklansa: shu foydalanuvchi versiyasi qayta o'qiladi (xabar yo'qolsa: har daqiqada)
    await this.cluster.subscribe((m) => {
      if (m.t === "cred") void this.reloadVersion(m.user);
    });
    this.reloadTimer = setInterval(() => void this.reloadVersions().catch(() => undefined), 60_000);
    this.reloadTimer.unref();
    // Demo ma'lumotlar: demo foydalanuvchilarga ma'lum parol (faqat SEED_DEMO yoqilganda)
    if (this.config.seedDemo) {
      const demo = DEMO_ACCOUNTS.map((a) => this.store.db.users.find((u) => u.phone === a.phone)).filter((u): u is AppUser => !!u);
      let n = 0;
      for (const u of demo) if (!this.versions.has(u.id)) { await this.store_(u.id, DEMO_PASSWORD, false); n++; }
      if (n) this.log.warn(`Demo foydalanuvchilarga parol qo'yildi: ${DEMO_PASSWORD} (${n} ta)`);
    }
  }

  onModuleDestroy() {
    if (this.reloadTimer) clearInterval(this.reloadTimer);
  }

  private async reloadVersions() {
    const rows = await this.sql.query<{ user_id: string; token_ver: number }>("SELECT user_id, token_ver FROM credentials");
    for (const r of rows) this.versions.set(r.user_id, Number(r.token_ver));
  }

  private async reloadVersion(userId: string) {
    const [r] = await this.sql.query<{ token_ver: number }>("SELECT token_ver FROM credentials WHERE user_id = $1", [userId]);
    if (r) this.versions.set(userId, Number(r.token_ver));
    else this.versions.delete(userId);
  }

  tokenVersion(userId: string): number {
    return this.versions.get(userId) ?? 0;
  }

  private async row(userId: string): Promise<Row | undefined> {
    const [r] = await this.sql.query<Row>("SELECT user_id, hash, must_change, token_ver FROM credentials WHERE user_id = $1", [userId]);
    return r;
  }

  private async store_(userId: string, password: string, mustChange: boolean, bumpVersion = false): Promise<number> {
    const hash = await hashPassword(password);
    // Versiya bazada oshiriladi (boshqa nusxa ham bir vaqtda yozsa ham to'g'ri)
    const [r] = await this.sql.query<{ token_ver: number }>(
      `INSERT INTO credentials (user_id, hash, must_change, token_ver, updated_at) VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (user_id) DO UPDATE SET hash = EXCLUDED.hash, must_change = EXCLUDED.must_change,
         token_ver = credentials.token_ver + $4, updated_at = now()
       RETURNING token_ver`,
      [userId, hash, mustChange, bumpVersion ? 1 : 0]);
    const ver = Number(r.token_ver);
    this.versions.set(userId, ver);
    if (bumpVersion) await this.cluster.publish({ t: "cred", user: userId });
    return ver;
  }

  /** Login bo'yicha xato urinishlar: 15 daqiqada 10 ta → blok (hisoblagich bazada, barcha nusxalar uchun). */
  private async blocked(key: string) {
    const f = await this.limits.peek(`loginfail:${key}`);
    if (f.n >= 10) throw new CommandError("err.loginBlocked", { m: Math.ceil(f.wait / 60) }, 429);
  }

  private async fail(key: string) {
    await this.limits.hit(`loginfail:${key}`, 15 * 60);
  }

  /** Login (ism.familiya yoki telefon) + parol. */
  async login(rawLogin: string, password: string): Promise<{ user: AppUser; mustChange: boolean }> {
    const key = String(rawLogin ?? "").trim().toLowerCase().replace(/\s+/g, "");
    await this.blocked(key);
    let user: AppUser;
    try {
      user = findUserByLogin(this.store.db, rawLogin);
    } catch (e) {
      if (e instanceof CommandError && e.key === "err.institutionBlocked") throw e;
      // Javob vaqti bo'yicha "bunday login bor-yo'q"ni bilib bo'lmasin: baribir xesh hisoblanadi
      await verifyHash(String(password ?? ""), await this.dummy());
      await this.fail(key);
      throw new CommandError("err.badLogin", {}, 401);
    }
    const r = await this.row(user.id);
    if (!r || !(await verifyHash(String(password ?? ""), r.hash))) {
      await this.fail(key);
      throw new CommandError("err.badLogin", {}, 401);
    }
    await this.limits.clear(`loginfail:${key}`);
    return { user, mustChange: !!r.must_change };
  }

  private dummyHash: Promise<string> | null = null;
  private dummy(): Promise<string> {
    this.dummyHash ??= hashPassword("dummy-password-for-timing");
    return this.dummyHash;
  }

  /** Administrator yangi parol beradi: qaytadi faqat shu bir marta (kirish kartasi uchun). */
  async reset(actor: AppUser, targetId: string): Promise<{ login: string; password: string; name: string }> {
    const target = this.store.db.users.find((u) => u.id === targetId);
    if (!target) throw new CommandError("err.notFound", {}, 404);
    if (!canManageCredentials(actor, target, this.store.db)) throw new CommandError("err.forbidden", {}, 403);
    const login = loginOf(target);
    if (!login) throw new CommandError("err.noLogin", {}, 400);
    const password = generatePassword(target.role);
    await this.store_(target.id, password, true, true);
    this.log.log(`Parol berildi: ${target.id} (${actor.id} tomonidan)`);
    return { login, password, name: target.name };
  }

  /** Foydalanuvchi o'z parolini almashtiradi (eski parol bilan). */
  async change(user: AppUser, current: string, next: string): Promise<void> {
    const r = await this.row(user.id);
    if (!r || !(await verifyHash(String(current ?? ""), r.hash))) throw new CommandError("err.badPassword", {}, 400);
    checkNewPassword(next, user.role);
    if (next === current) throw new CommandError("err.passwordSame", {}, 400);
    await this.store_(user.id, next, false);
  }

  /** Kimlarda parol bor (administrator ro'yxatda "parol berilgan" belgisini ko'rishi uchun). */
  async status(actor: AppUser, ids: string[]): Promise<Record<string, { login: string; hasPassword: boolean }>> {
    const allowed = ids.slice(0, 500).map((id) => this.store.db.users.find((u) => u.id === id))
      .filter((u): u is AppUser => !!u && canManageCredentials(actor, u, this.store.db));
    if (!allowed.length) return {};
    const rows = await this.sql.query<{ user_id: string }>("SELECT user_id FROM credentials WHERE user_id = ANY($1::text[])", [allowed.map((u) => u.id)]);
    const has = new Set(rows.map((r) => r.user_id));
    return Object.fromEntries(allowed.map((u) => [u.id, { login: loginOf(u), hasPassword: has.has(u.id) }]));
  }

  /** Super admin uchun (create-admin skripti). */
  async setInitial(userId: string, password: string) {
    await this.store_(userId, password, true, true);
  }
}
