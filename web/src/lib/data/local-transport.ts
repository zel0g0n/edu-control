import {
  AUDIT_SKIP,
  auditSummary,
  newBackupCodes,
  newTotpSecret,
  normalizeBackupCode,
  otpauthUrl,
  verifyTotp,
  CommandError,
  DEMO_ACCOUNTS,
  DEMO_PASSWORD,
  applyPatch,
  assignMissingReceiptIds,
  canManageCredentials,
  checkNewPassword,
  ensureStudentAccounts,
  findLoginCandidates,
  linkedProfiles,
  attendanceBetween,
  generatePassword,
  loginOf,
  executeCommand,
  findLoginUser,
  scopeDatabase,
  scopePatch,
  seedDatabase,
  verifyLogin,
  newId,
  type AppUser,
  type AttendanceRecord,
  type Attachment,
  type AuditEntry,
  type CommandMap,
  type CommandName,
  type Database,
  type Patch,
} from "@edunazorat/shared";

import {
  DEMO_FILE_LIMIT, readDataUrl, shrinkImage,
  type LiveEvent, type ProfileInfo, type SessionInfo, type SignInResult, type Transport,
} from "./transport";

// Demo rejimi (server yo'q): alohida modul — API rejimida brauzerga yuklanmaydi.

const DB_KEY = "edunazorat-demo-v2";
const AUDIT_KEY = "edunazorat-demo-audit";
const MFA_KEY = "edunazorat-demo-mfa";
/** Demo rejimdagi parollar (faqat xesh). Haqiqiy tizimda ular serverda, alohida jadvalda. */
const CRED_KEY = "edunazorat-demo-creds";
type LocalCred = { salt: string; hash: string; mustChange: boolean };

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Demo rejimi: "server" brauzerning o'zida, ma'lumotlar localStorage'da.
 * Buyruqlar NestJS serverdagi bilan bir xil kod (shared/server) orqali bajariladi
 * va foydalanuvchi faqat o'ziga ruxsat etilgan ma'lumotni oladi (shared/scope).
 */
export class LocalTransport implements Transport {
  mode = "local" as const;
  private readonly since = Date.now();
  private db: Database | null = null;
  private actorId: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly clock: () => number = () => Date.now(),
    private readonly storage: Storage | null = typeof window === "undefined" ? null : window.localStorage,
    /** Testlar: har bir yozuvni darhol saqlash va har safar o'qish (bir nechta foydalanuvchi). */
    private readonly syncWrites = false,
  ) {
    if (typeof window !== "undefined") window.addEventListener("pagehide", () => this.flush());
  }

  async signFileUrls(urls: string[]) {
    return Object.fromEntries(urls.map((u) => [u, u]));
  }

  /** Demo: faqat shu brauzer. */
  async sessions(): Promise<SessionInfo[]> {
    return [{ id: "demo", createdAt: this.since, lastSeen: Date.now(), agent: typeof navigator === "undefined" ? "" : navigator.userAgent, current: true }];
  }

  async revokeOtherSessions() {
    return { revoked: 0 };
  }

  private get data(): Database {
    if (this.db && !this.syncWrites) return this.db;
    try {
      const raw = this.storage?.getItem(DB_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Database;
        if (parsed.version === 2) {
          // Eski demo ma'lumotlarda yangi to'plamlar yo'q
          parsed.leads ??= [];
          // Eski demo ma'lumotlarda Kvitansiya ID yo'q: bir marta beriladi
          const acc = ensureStudentAccounts(parsed);
          for (const u of acc.users) { const i = parsed.users.findIndex((x) => x.id === u.id); if (i >= 0) parsed.users[i] = u; else parsed.users.push(u); }
          for (const st of acc.students) Object.assign(parsed.students.find((x) => x.id === st.id)!, { userId: st.userId });
          const missing = assignMissingReceiptIds(parsed);
          for (const s of missing) Object.assign(parsed.students.find((x) => x.id === s.id)!, { receiptId: s.receiptId });
          this.db = parsed;
          if (missing.length || acc.users.length) this.flush();
          return parsed;
        }
      }
    } catch {
      // buzilgan yoki yopiq xotira: qayta yaratamiz
    }
    this.db = seedDatabase(this.clock());
    if (this.syncWrites) this.flush();
    return this.db;
  }

  private persist() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 150);
  }

  flush() {
    if (!this.db || !this.storage) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    try {
      this.storage.setItem(DB_KEY, JSON.stringify(this.db));
    } catch {
      // xotira to'lgan: demo rejimda faqat shu oynada qoladi
    }
  }

  private actorIn(db: Database) {
    const a = db.users.find((u) => u.id === this.actorId && u.active);
    if (!a) throw new CommandError("err.forbidden", {}, 401);
    return a;
  }

  async requestCode(phone: string) {
    findLoginUser(this.data, phone);
    return { devCode: "1111" };
  }

  async verifyCode(phone: string, code: string): Promise<SignInResult> {
    const u = verifyLogin(this.data, phone, code);
    if (this.mfa()[u.id]?.enabled) return { userId: u.id, mfaToken: `demo:${u.id}` };
    this.actorId = u.id;
    return { userId: u.id };
  }

  // ---- Demo 2FA (shu brauzerda; serverdagi bilan bir xil TOTP)
  private mfa(): Record<string, { secret: string; enabled: boolean; backup: string[]; lastStep: number }> {
    try { return JSON.parse(this.storage?.getItem(MFA_KEY) ?? "{}"); } catch { return {}; }
  }
  private saveMfa(m: ReturnType<LocalTransport["mfa"]>) {
    this.storage?.setItem(MFA_KEY, JSON.stringify(m));
  }

  async mfaVerify(mfaToken: string, code: string): Promise<SignInResult> {
    const userId = mfaToken.startsWith("demo:") ? mfaToken.slice(5) : "";
    const m = this.mfa();
    const rec = m[userId];
    if (!rec?.enabled) throw new CommandError("err.mfaExpired", {}, 401);
    const step = await verifyTotp(rec.secret, code, this.clock(), rec.lastStep);
    if (step !== null) rec.lastStep = step;
    else {
      const h = await sha256(normalizeBackupCode(code));
      if (!rec.backup.includes(h)) throw new CommandError("err.mfaCode", {}, 401);
      rec.backup = rec.backup.filter((x) => x !== h);
    }
    this.saveMfa(m);
    this.actorId = userId;
    return { userId };
  }

  async mfaStatus() {
    const me = this.actorIn(this.data);
    return { enabled: !!this.mfa()[me.id]?.enabled, required: false };
  }

  async mfaSetup() {
    const me = this.actorIn(this.data);
    const m = this.mfa();
    if (m[me.id]?.enabled) throw new CommandError("err.mfaAlready", {}, 400);
    const secret = newTotpSecret();
    m[me.id] = { secret, enabled: false, backup: [], lastStep: -1 };
    this.saveMfa(m);
    return { secret, url: otpauthUrl(secret, me.login ?? me.phone ?? me.name) };
  }

  private async newBackup(rec: { backup: string[] }) {
    const codes = newBackupCodes();
    rec.backup = await Promise.all(codes.map((c) => sha256(normalizeBackupCode(c))));
    return codes;
  }

  async mfaEnable(code: string) {
    const me = this.actorIn(this.data);
    const m = this.mfa();
    const rec = m[me.id];
    if (!rec || rec.enabled) throw new CommandError("err.mfaNoSetup", {}, 400);
    const step = await verifyTotp(rec.secret, code, this.clock(), rec.lastStep);
    if (step === null) throw new CommandError("err.mfaCode", {}, 400);
    rec.enabled = true;
    rec.lastStep = step;
    const backupCodes = await this.newBackup(rec);
    this.saveMfa(m);
    return { backupCodes };
  }

  private async checkOwnCode(code: string) {
    const me = this.actorIn(this.data);
    const m = this.mfa();
    const rec = m[me.id];
    const step = rec?.enabled ? await verifyTotp(rec.secret, code, this.clock(), rec.lastStep) : null;
    if (step === null || !rec) throw new CommandError("err.mfaCode", {}, 400);
    rec.lastStep = step;
    return { m, rec, me };
  }

  async mfaDisable(code: string) {
    const { m, me } = await this.checkOwnCode(code);
    delete m[me.id];
    this.saveMfa(m);
  }

  async mfaBackupCodes(code: string) {
    const { m, rec } = await this.checkOwnCode(code);
    const backupCodes = await this.newBackup(rec);
    this.saveMfa(m);
    return { backupCodes };
  }

  private creds(): Record<string, LocalCred> {
    try {
      return JSON.parse(this.storage?.getItem(CRED_KEY) ?? "{}") as Record<string, LocalCred>;
    } catch {
      return {};
    }
  }

  private async setCred(userId: string, password: string, mustChange: boolean) {
    const salt = newId("s");
    const all = this.creds();
    all[userId] = { salt, hash: await sha256(`${salt}:${password}`), mustChange };
    try {
      this.storage?.setItem(CRED_KEY, JSON.stringify(all));
    } catch {
      // xotira yopiq
    }
  }

  async authMethods() {
    return { sms: true };
  }

  async loginPassword(login: string, password: string) {
    // Bir telefonda bir nechta profil bo'lsa: parol mos kelgan birinchisi (ustuvorlik tartibida)
    let u: AppUser | undefined;
    for (const x of findLoginCandidates(this.data, login)) {
      const cx = this.creds()[x.id];
      // Demo foydalanuvchilar: o'z paroli o'rnatilmaguncha umumiy demo parol
      const ok = cx ? (await sha256(`${cx.salt}:${password}`)) === cx.hash : DEMO_ACCOUNTS.some((a) => a.phone === x.phone) && password === DEMO_PASSWORD;
      if (ok) { u = x; break; }
    }
    if (!u) throw new CommandError("err.badLogin", {}, 401);
    const c = this.creds()[u.id];
    if (this.mfa()[u.id]?.enabled) return { userId: u.id, mustChange: !!c?.mustChange, mfaToken: `demo:${u.id}` };
    this.actorId = u.id;
    return { userId: u.id, mustChange: !!c?.mustChange };
  }

  async resetPassword(userId: string) {
    const db = this.data;
    const actor = this.actorIn(db);
    const target = db.users.find((u) => u.id === userId);
    if (!target) throw new CommandError("err.notFound", {}, 404);
    if (!canManageCredentials(actor, target, db)) throw new CommandError("err.forbidden", {}, 403);
    const password = generatePassword(target.role);
    await this.setCred(userId, password, true);
    return { login: loginOf(target), password, name: target.name };
  }

  async changePassword(current: string, next: string) {
    const db = this.data;
    const actor = this.actorIn(db);
    const c = this.creds()[actor.id];
    const ok = c ? (await sha256(`${c.salt}:${current}`)) === c.hash : DEMO_ACCOUNTS.some((a) => a.phone === actor.phone) && current === DEMO_PASSWORD;
    if (!ok) throw new CommandError("err.badPassword", {}, 400);
    checkNewPassword(next, actor.role);
    if (next === current) throw new CommandError("err.passwordSame", {}, 400);
    await this.setCred(actor.id, next, false);
  }

  async credentialStatus(ids: string[]) {
    const db = this.data;
    const actor = this.actorIn(db);
    const all = this.creds();
    const out: Record<string, { login: string; hasPassword: boolean }> = {};
    for (const id of ids) {
      const u = db.users.find((x) => x.id === id);
      if (u && canManageCredentials(actor, u, db)) out[id] = { login: loginOf(u), hasPassword: !!all[id] || DEMO_ACCOUNTS.some((a) => a.phone === u.phone) };
    }
    return out;
  }

  async bootstrap(userId: string) {
    this.actorId = userId;
    const db = this.data;
    return scopeDatabase(db, this.actorIn(db));
  }

  async command<K extends CommandName>(name: K, input: CommandMap[K]): Promise<Patch> {
    const db = this.data;
    const actor = this.actorIn(db);
    const patch = executeCommand(db, actor, name, input, this.clock());
    applyPatch(db, patch);
    if (this.syncWrites) this.flush();
    else this.persist();
    this.logAudit(actor, name, input, patch);
    return scopePatch(db, actor, patch);
  }

  /** Demo: jurnal shu brauzerda (oxirgi 500 ta). */
  private logAudit(actor: AppUser, name: string, input: unknown, patch: Patch) {
    if (AUDIT_SKIP.has(name) || !this.storage) return;
    try {
      const list = JSON.parse(this.storage.getItem(AUDIT_KEY) ?? "[]") as AuditEntry[];
      const { target, details } = auditSummary(name, input, patch);
      const inst = actor.institutionId ?? patch.upsert?.institutions?.[0]?.id;
      list.unshift({ id: String(this.clock()) + list.length, at: this.clock(), actorId: actor.id, actorRole: actor.role, institutionId: inst, action: name, target, details });
      this.storage.setItem(AUDIT_KEY, JSON.stringify(list.slice(0, 500)));
    } catch {
      // jurnal saqlanmasa ham ish davom etadi
    }
  }

  async audit(before?: string): Promise<AuditEntry[]> {
    const db = this.data;
    const actor = this.actorIn(db);
    if (actor.role !== "director" && actor.role !== "superAdmin") throw new CommandError("err.forbidden", {}, 403);
    let list: AuditEntry[] = [];
    try { list = JSON.parse(this.storage?.getItem(AUDIT_KEY) ?? "[]") as AuditEntry[]; } catch { list = []; }
    const mine = list.filter((e) => actor.role === "superAdmin" || e.institutionId === actor.institutionId);
    const start = before ? mine.findIndex((e) => e.id === before) + 1 : 0;
    return mine.slice(start, start + 50);
  }

  async attendanceRange(from: string, to: string): Promise<AttendanceRecord[]> {
    const db = this.data;
    return attendanceBetween(db, this.actorIn(db), from, to);
  }

  async profiles(): Promise<ProfileInfo[]> {
    const db = this.data;
    const me = this.actorIn(db);
    return [me, ...linkedProfiles(db, me)].map((p) => ({
      id: p.id, name: p.name, role: p.role, institution: db.institutions.find((i) => i.id === p.institutionId)?.name ?? "", current: p.id === me.id,
    }));
  }

  async switchProfile(userId: string): Promise<SignInResult> {
    const db = this.data;
    const me = this.actorIn(db);
    const target = linkedProfiles(db, me).find((p) => p.id === userId);
    if (!target) throw new CommandError("err.forbidden", {}, 403);
    if (this.mfa()[target.id]?.enabled && !this.mfa()[me.id]?.enabled) throw new CommandError("err.profileMfa", {}, 403);
    this.actorId = target.id;
    return { userId: target.id };
  }

  async signOut() {
    this.actorId = null;
    this.flush();
  }

  listen(fn: (e: LiveEvent) => void) {
    if (typeof window === "undefined") return () => {};
    // Boshqa oynada (masalan, o'qituvchi va ota-ona yonma-yon) o'zgarsa.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== DB_KEY) return;
      this.db = null;
      fn({ type: "reload" });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }

  async upload(file: File): Promise<Attachment> {
    const blob = await shrinkImage(file);
    if (blob.size > DEMO_FILE_LIMIT) throw new CommandError("err.demoFileTooLarge", { kb: Math.round(DEMO_FILE_LIMIT / 1024) });
    const isImage = blob !== file;
    return { id: newId("f"), name: isImage ? file.name.replace(/\.\w+$/, ".jpg") : file.name, type: isImage ? "image/jpeg" : file.type || "application/octet-stream", size: blob.size, url: await readDataUrl(blob) };
  }

  async resetDemo() {
    this.db = seedDatabase(this.clock());
    try {
      this.storage?.removeItem(CRED_KEY);
    } catch {
      // yo'q
    }
    this.flush();
  }
}

