import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  CommandError, needsStrongPassword, newBackupCodes, newTotpSecret, normalizeBackupCode, otpauthUrl, verifyTotp, type AppUser,
} from "@edunazorat/shared";

import { ClusterService } from "../cluster.service";
import { CONFIG, type Config } from "../config";
import { SQL, type Sql } from "../db/sql";
import { StoreService } from "../store.service";

interface Row { user_id: string; secret_enc: string; enabled: boolean; backup: unknown; last_step: string | number | null }

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * Ikki bosqichli kirish (TOTP). Maxfiy kalit bazada AES-256-GCM bilan shifrlangan (MFA_KEY),
 * zaxira kodlar faqat xesh. Rahbariyat (direktor, administrator, super admin) uchun production'da majburiy.
 */
@Injectable()
export class MfaService implements OnModuleInit, OnModuleDestroy {
  /** Yoqilgan foydalanuvchilar (har so'rovda bazaga bormaslik uchun). */
  private enabledUsers = new Set<string>();
  private readonly key: Buffer;

  constructor(
    @Inject(SQL) private readonly sql: Sql,
    @Inject(StoreService) private readonly store: StoreService,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(ClusterService) private readonly cluster: ClusterService,
  ) {
    this.key = config.mfaKey ?? createHash("sha256").update(`edunazorat-mfa:${config.jwtSecret}`).digest();
  }

  private timer: NodeJS.Timeout | null = null;

  async onModuleInit() {
    await this.store.ready;
    await this.reloadEnabled();
    // Boshqa nusxada yoqilsa/o'chirilsa (xabar yo'qolsa: har daqiqada to'liq)
    await this.cluster.subscribe((m) => {
      if (m.t === "mfa") void this.reloadUser(m.user);
    });
    this.timer = setInterval(() => void this.reloadEnabled().catch(() => undefined), 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async reloadUser(userId: string) {
    const [r] = await this.sql.query<{ enabled: boolean }>("SELECT enabled FROM mfa WHERE user_id = $1", [userId]);
    if (r?.enabled) this.enabledUsers.add(userId);
    else this.enabledUsers.delete(userId);
  }

  async reloadEnabled() {
    const rows = await this.sql.query<{ user_id: string }>("SELECT user_id FROM mfa WHERE enabled");
    this.enabledUsers = new Set(rows.map((r) => r.user_id));
  }

  enabled(userId: string): boolean {
    return this.enabledUsers.has(userId);
  }

  /** Rahbariyat a'zosi 2FA'ni yoqmagan: faqat sozlash sahifasi ochiladi. */
  setupRequired(u: AppUser): boolean {
    return this.config.requireStaff2fa && needsStrongPassword(u.role) && !this.enabled(u.id);
  }

  private encrypt(plain: string): string {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", this.key, iv);
    const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
    return `v1.${iv.toString("base64")}.${c.getAuthTag().toString("base64")}.${enc.toString("base64")}`;
  }

  private decrypt(s: string): string {
    const [v, iv, tag, data] = s.split(".");
    if (v !== "v1") throw new Error("mfa format");
    const d = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
  }

  private async row(userId: string): Promise<Row | undefined> {
    const [r] = await this.sql.query<Row>("SELECT user_id, secret_enc, enabled, backup, last_step FROM mfa WHERE user_id = $1", [userId]);
    return r;
  }

  status(u: AppUser) {
    return { enabled: this.enabled(u.id), required: this.config.requireStaff2fa && needsStrongPassword(u.role) };
  }

  /** Yangi kalit (hali yoqilmagan): ilovaga QR orqali qo'shiladi. */
  async setup(u: AppUser): Promise<{ secret: string; url: string }> {
    if (this.enabled(u.id)) throw new CommandError("err.mfaAlready", {}, 400);
    const secret = newTotpSecret();
    await this.sql.query(
      `INSERT INTO mfa (user_id, secret_enc, enabled, backup, last_step) VALUES ($1, $2, false, '[]'::jsonb, -1)
       ON CONFLICT (user_id) DO UPDATE SET secret_enc = EXCLUDED.secret_enc, enabled = false, backup = '[]'::jsonb, last_step = -1, updated_at = now()`,
      [u.id, this.encrypt(secret)],
    );
    return { secret, url: otpauthUrl(secret, u.login ?? u.phone ?? u.name) };
  }

  /** Ilovadagi kod bilan tasdiqlash: yoqiladi, zaxira kodlar bir marta ko'rsatiladi. */
  async enable(u: AppUser, code: string): Promise<{ backupCodes: string[] }> {
    const r = await this.row(u.id);
    if (!r || r.enabled) throw new CommandError("err.mfaNoSetup", {}, 400);
    const step = await verifyTotp(this.decrypt(r.secret_enc), code, this.store.clock(), Number(r.last_step ?? -1));
    if (step === null) throw new CommandError("err.mfaCode", {}, 400);
    const codes = newBackupCodes();
    await this.sql.query("UPDATE mfa SET enabled = true, backup = $2::jsonb, last_step = $3, updated_at = now() WHERE user_id = $1",
      [u.id, JSON.stringify(codes.map((c) => sha(normalizeBackupCode(c)))), step]);
    this.enabledUsers.add(u.id);
    await this.cluster.publish({ t: "mfa", user: u.id });
    return { backupCodes: codes };
  }

  /**
   * Kirishda ikkinchi qadam: ilova kodi yoki zaxira kod (bir martalik).
   * "backup": zaxira kod ishlatildi (jurnalga yoziladi).
   */
  async verify(userId: string, code: string): Promise<"totp" | "backup" | null> {
    const r = await this.row(userId);
    if (!r || !r.enabled) return null;
    const step = await verifyTotp(this.decrypt(r.secret_enc), code, this.store.clock(), Number(r.last_step ?? -1));
    if (step !== null) {
      // Bir xil kod ikki marta ishlamaydi (shart bilan: bir vaqtda ikki so'rov ham)
      const upd = await this.sql.query<{ user_id: string }>("UPDATE mfa SET last_step = $2 WHERE user_id = $1 AND last_step < $2 RETURNING user_id", [userId, step]);
      return upd.length ? "totp" : null;
    }
    const norm = normalizeBackupCode(code);
    if (norm.length !== 8) return null;
    const h = sha(norm);
    const list = (Array.isArray(r.backup) ? r.backup : JSON.parse(String(r.backup ?? "[]"))) as string[];
    const hit = list.find((x) => x.length === h.length && timingSafeEqual(Buffer.from(x), Buffer.from(h)));
    if (!hit) return null;
    const rest = list.filter((x) => x !== hit);
    const upd = await this.sql.query<{ user_id: string }>("UPDATE mfa SET backup = $2::jsonb WHERE user_id = $1 AND backup @> $3::jsonb RETURNING user_id",
      [userId, JSON.stringify(rest), JSON.stringify([hit])]);
    return upd.length ? "backup" : null;
  }

  /** O'chirish (majburiy bo'lmasa) yoki yangi zaxira kodlar: joriy kod bilan. */
  async disable(u: AppUser, code: string) {
    if (this.status(u).required) throw new CommandError("err.mfaRequired", {}, 400);
    if (!(await this.verify(u.id, code))) throw new CommandError("err.mfaCode", {}, 400);
    await this.reset(u.id);
  }

  async regenerateBackup(u: AppUser, code: string): Promise<{ backupCodes: string[] }> {
    if (!(await this.verify(u.id, code))) throw new CommandError("err.mfaCode", {}, 400);
    const codes = newBackupCodes();
    await this.sql.query("UPDATE mfa SET backup = $2::jsonb, updated_at = now() WHERE user_id = $1", [u.id, JSON.stringify(codes.map((c) => sha(normalizeBackupCode(c))))]);
    return { backupCodes: codes };
  }

  /** Rahbar parolni tiklaganda (telefon yo'qolgan): 2FA qayta sozlanadi. */
  async reset(userId: string) {
    await this.sql.query("DELETE FROM mfa WHERE user_id = $1", [userId]);
    this.enabledUsers.delete(userId);
    await this.cluster.publish({ t: "mfa", user: userId });
  }
}
