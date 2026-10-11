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
  findUserByLogin,
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
  type Attachment,
  type AuditEntry,
  type CommandMap,
  type CommandName,
  type Database,
  type Patch,
} from "@edunazorat/shared";

/** Serverdan kelgan real vaqt hodisasi (boshqa foydalanuvchi o'zgartirdi). */
export type LiveEvent = { type: "patch"; patch: Patch } | { type: "reload" };

export interface IssuedCredentials { login: string; password: string; name: string }

/** Ma'lumot manbai: demo (brauzer) yoki NestJS API. */
export interface Transport {
  mode: "local" | "remote";
  requestCode(phone: string): Promise<{ devCode?: string }>;
  verifyCode(phone: string, code: string): Promise<SignInResult>;
  /** Qaysi kirish usullari yoqilgan. */
  authMethods(): Promise<{ sms: boolean }>;
  /** Login (ism.familiya yoki telefon) + parol. */
  loginPassword(login: string, password: string): Promise<SignInResult & { mustChange: boolean }>;
  /** 2FA: parol to'g'ri bo'lgach ilova kodi yoki zaxira kod. */
  mfaVerify(mfaToken: string, code: string): Promise<SignInResult>;
  mfaStatus(): Promise<{ enabled: boolean; required: boolean }>;
  mfaSetup(): Promise<{ secret: string; url: string }>;
  mfaEnable(code: string): Promise<{ backupCodes: string[] }>;
  mfaDisable(code: string): Promise<void>;
  mfaBackupCodes(code: string): Promise<{ backupCodes: string[] }>;
  /** Yangi parol berish: natija faqat shu bir marta ko'rinadi (kirish kartasi). */
  resetPassword(userId: string): Promise<IssuedCredentials>;
  changePassword(current: string, next: string): Promise<void>;
  credentialStatus(ids: string[]): Promise<Record<string, { login: string; hasPassword: boolean }>>;
  bootstrap(userId: string): Promise<Database>;
  command<K extends CommandName>(name: K, input: CommandMap[K]): Promise<Patch>;
  signOut(): Promise<void>;
  /** Boshqa oyna/qurilmadagi o'zgarishlar. */
  listen(fn: (e: LiveEvent) => void): () => void;
  /** Fayl yuklash (vazifa ilovasi). */
  upload(file: File): Promise<Attachment>;
  resetDemo?(): Promise<void>;
  /** Mening qurilmalarim (faqat serverda; demo rejimda bitta). */
  sessions(): Promise<SessionInfo[]>;
  revokeOtherSessions(): Promise<{ revoked: number }>;
  /** Faoliyat jurnali (direktor). */
  audit(before?: string): Promise<AuditEntry[]>;
  /** Fayl havolalari: serverda qisqa muddatli imzoli havolaga almashtiriladi (demo: o'zi). */
  signFileUrls(urls: string[]): Promise<Record<string, string>>;
}

/** Kirish natijasi: mfaToken bo'lsa ilova kodi so'raladi; mfaSetupRequired bo'lsa avval 2FA sozlanadi. */
export interface SignInResult {
  userId: string;
  mfaToken?: string;
  mfaSetupRequired?: boolean;
}

export interface SessionInfo {
  id: string;
  createdAt: number;
  lastSeen: number;
  agent: string;
  current: boolean;
}

/** Demo rejimda localStorage sig'imi kichik: fayllar shu hajmdan oshmasin. */
export const DEMO_FILE_LIMIT = 400 * 1024;

/** Rasmni kichraytirish (uzun tomoni 1600px, JPEG). */
async function shrinkImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.8));
  return blob && blob.size < file.size ? blob : file;
}

function readDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

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
    const u = findUserByLogin(this.data, login);
    const c = this.creds()[u.id];
    // Demo foydalanuvchilar: o'z paroli o'rnatilmaguncha umumiy demo parol
    const ok = c ? (await sha256(`${c.salt}:${password}`)) === c.hash : DEMO_ACCOUNTS.some((a) => a.phone === u.phone) && password === DEMO_PASSWORD;
    if (!ok) throw new CommandError("err.badLogin", {}, 401);
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

/** Eski versiyalardagi uzoq muddatli token (o'chiriladi). */
const OLD_TOKEN_KEY = "edunazorat-token";
/** Refresh token (faqat cookie rejimi bo'lmaganda; kirish tokeni hech qachon saqlanmaydi). */
const RT_KEY = "edunazorat-rt";
/** Cookie rejimi: refresh token httpOnly cookie'da, bu yerda faqat belgi. */
const COOKIE_FLAG = "edunazorat-rt-cookie";

interface TokenResponse { token: string; expiresIn: number; refreshToken?: string; userId: string }

function storageGet(k: string): string | null {
  try { return window.localStorage.getItem(k); } catch { return null; }
}
function storageSet(k: string, v: string | null) {
  try {
    if (v === null) window.localStorage.removeItem(k);
    else window.localStorage.setItem(k, v);
  } catch {
    // saqlanmasa: faqat shu oyna
  }
}

/**
 * NestJS API (NEXT_PUBLIC_API_URL berilganda).
 * Kirish tokeni 15 daqiqalik va faqat xotirada; muddati tugashidan oldin refresh token bilan
 * jimgina yangilanadi. Refresh token har safar almashadi (eskisi qayta ishlatilsa sessiya bekor).
 */
export class RemoteTransport implements Transport {
  mode = "remote" as const;
  private token: string | null = null;
  private tokenExp = 0;
  private refreshing: Promise<void> | null = null;

  constructor(private readonly base: string) {
    storageSet(OLD_TOKEN_KEY, null);
  }

  private get cookieMode(): boolean {
    return storageGet(COOKIE_FLAG) === "1";
  }

  /** Server cookie rejimidami (credentials: include faqat shunda: aks holda CORS rad etadi). */
  private methods: Promise<{ sms: boolean; cookie: boolean }> | null = null;
  private serverMethods() {
    this.methods ??= this.raw("/auth/methods", undefined, false)
      .then((r) => RemoteTransport.parse<{ sms: boolean; cookie?: boolean }>(r))
      .then((m) => ({ sms: !!m.sms, cookie: !!m.cookie }))
      .catch((e) => { this.methods = null; throw e; });
    return this.methods;
  }

  private hasSession(): boolean {
    return !!this.token || !!storageGet(RT_KEY) || this.cookieMode;
  }

  private keep(r: TokenResponse) {
    this.token = r.token;
    this.tokenExp = Date.now() + r.expiresIn * 1000;
    if (r.refreshToken) {
      storageSet(RT_KEY, r.refreshToken);
      storageSet(COOKIE_FLAG, null);
    } else {
      storageSet(RT_KEY, null);
      storageSet(COOKIE_FLAG, "1");
    }
  }

  private forget() {
    this.token = null;
    this.tokenExp = 0;
    storageSet(RT_KEY, null);
    storageSet(COOKIE_FLAG, null);
  }

  private async raw(path: string, body: unknown, auth: boolean, withCookie = false): Promise<Response> {
    try {
      return await fetch(`${this.base}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", ...(auth && this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: withCookie ? "include" : "omit",
      });
    } catch {
      throw new CommandError("err.network", {}, 0);
    }
  }

  private static async parse<T>(res: Response): Promise<T> {
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) throw new CommandError(data?.key ?? "err.network", data?.params ?? {}, res.status);
    return data as T;
  }

  /** Yangi kirish tokeni. Bir nechta oyna bir vaqtda yangilamasligi uchun qulf (Web Locks). */
  private refresh(): Promise<void> {
    this.refreshing ??= (async () => {
      const run = async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          // Boshqa oyna yangilagan bo'lishi mumkin: har safar saqlangan tokenni qayta o'qiymiz
          const cookie = this.cookieMode;
          const rt = storageGet(RT_KEY);
          if (!cookie && !rt) throw new CommandError("err.sessionExpired", {}, 401);
          const res = await this.raw("/auth/refresh", cookie ? {} : { refreshToken: rt }, false, cookie);
          if (res.status === 409) {
            await new Promise((r) => setTimeout(r, 400));
            continue;
          }
          const r = await RemoteTransport.parse<TokenResponse>(res).catch((e) => {
            if (e instanceof CommandError && e.status === 401) this.forget();
            throw e;
          });
          this.keep(r);
          return;
        }
        throw new CommandError("err.sessionExpired", {}, 401);
      };
      const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
      if (locks) await locks.request("edunazorat-refresh", run);
      else await run();
    })().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  /** Token bo'lmasa yoki 30 soniyadan kam qolgan bo'lsa yangilanadi. */
  private async ensureToken() {
    if (this.token && Date.now() < this.tokenExp - 30_000) return;
    if (!storageGet(RT_KEY) && !this.cookieMode) return;
    await this.refresh();
  }

  private async call<T>(path: string, body?: unknown): Promise<T> {
    const isAuth = path.startsWith("/auth/") && !["/auth/sessions", "/auth/sessions/revoke-others", "/auth/sign-out", "/auth/password/reset", "/auth/password/change", "/auth/credentials/status"].includes(path) && !path.startsWith("/auth/mfa/");
    if (!isAuth) await this.ensureToken();
    let res = await this.raw(path, body, !isAuth);
    if (res.status === 401 && !isAuth && this.hasSession()) {
      const data = await res.clone().json().catch(() => null);
      if (data?.key === "err.tokenExpired") {
        await this.refresh();
        res = await this.raw(path, body, true);
      }
    }
    return RemoteTransport.parse<T>(res);
  }

  async requestCode(phone: string) {
    return this.call<{ devCode?: string }>("/auth/request-code", { phone });
  }

  async verifyCode(phone: string, code: string) {
    const { cookie } = await this.serverMethods();
    const r = await RemoteTransport.parse<TokenResponse & { mfaToken?: string; mfaSetupRequired?: boolean }>(await this.raw("/auth/verify-code", { phone, code }, false, cookie));
    if (r.mfaToken) return { userId: r.userId, mfaToken: r.mfaToken };
    this.keep(r);
    return { userId: r.userId, mfaSetupRequired: r.mfaSetupRequired };
  }

  async mfaVerify(mfaToken: string, code: string): Promise<SignInResult> {
    const { cookie } = await this.serverMethods();
    const r = await RemoteTransport.parse<TokenResponse>(await this.raw("/auth/mfa/verify", { mfaToken, code }, false, cookie));
    this.keep(r);
    return { userId: r.userId };
  }

  async mfaStatus() {
    return this.call<{ enabled: boolean; required: boolean }>("/auth/mfa/status");
  }
  async mfaSetup() {
    return this.call<{ secret: string; url: string }>("/auth/mfa/setup", {});
  }
  async mfaEnable(code: string) {
    return this.call<{ backupCodes: string[] }>("/auth/mfa/enable", { code });
  }
  async mfaDisable(code: string) {
    await this.call("/auth/mfa/disable", { code });
  }
  async mfaBackupCodes(code: string) {
    return this.call<{ backupCodes: string[] }>("/auth/mfa/backup-codes", { code });
  }

  async authMethods() {
    return this.serverMethods().catch(() => ({ sms: false, cookie: false }));
  }

  async loginPassword(login: string, password: string) {
    // credentials: include — cookie rejimida server refresh cookie'ni o'rnatadi
    const { cookie } = await this.serverMethods();
    const r = await RemoteTransport.parse<TokenResponse & { mustChange: boolean; mfaToken?: string; mfaSetupRequired?: boolean }>(await this.raw("/auth/login", { login, password }, false, cookie));
    if (r.mfaToken) return { userId: r.userId, mustChange: r.mustChange, mfaToken: r.mfaToken };
    this.keep(r);
    return { userId: r.userId, mustChange: r.mustChange, mfaSetupRequired: r.mfaSetupRequired };
  }

  async resetPassword(userId: string) {
    return this.call<IssuedCredentials>("/auth/password/reset", { userId });
  }

  async changePassword(current: string, next: string) {
    await this.call("/auth/password/change", { current, next });
  }

  async credentialStatus(ids: string[]) {
    return this.call<Record<string, { login: string; hasPassword: boolean }>>("/auth/credentials/status", { ids });
  }

  async bootstrap() {
    if (!this.hasSession()) throw new CommandError("err.forbidden", {}, 401);
    return this.call<Database>("/bootstrap");
  }

  async command<K extends CommandName>(name: K, input: CommandMap[K]) {
    return this.call<Patch>(`/commands/${name}`, input);
  }

  async audit(before?: string) {
    return this.call<AuditEntry[]>(`/audit?limit=50${before ? `&before=${encodeURIComponent(before)}` : ""}`);
  }

  async signOut() {
    if (this.hasSession()) {
      await this.ensureToken().catch(() => undefined);
      // cookie rejimida server refresh cookie'ni ham o'chiradi
      await this.raw("/auth/sign-out", {}, true, this.cookieMode).catch(() => undefined);
    }
    this.forget();
  }

  listen(fn: (e: LiveEvent) => void) {
    if (!this.hasSession() || typeof EventSource === "undefined") return () => {};
    // Server-Sent Events: token URL'da yuborilmaydi; bir martalik qisqa chipta olinadi.
    // Uzilsa (server uxladi, tarmoq) yangi chipta bilan qayta ulanadi.
    let es: EventSource | null = null;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let delay = 2000;
    const open = async () => {
      if (stopped) return;
      try {
        const { ticket } = await this.call<{ ticket: string }>("/events/ticket", {});
        if (stopped) return;
        es = new EventSource(`${this.base}/events?ticket=${encodeURIComponent(ticket)}`);
        es.addEventListener("open", () => { delay = 2000; });
        es.addEventListener("patch", (e) => fn({ type: "patch", patch: JSON.parse((e as MessageEvent).data) }));
        es.addEventListener("reload", () => fn({ type: "reload" }));
        es.addEventListener("error", () => {
          es?.close();
          es = null;
          schedule();
        });
      } catch (e) {
        // Sessiya tugagan bo'lsa qayta urinilmaydi
        if (e instanceof CommandError && e.status === 401) return;
        schedule();
      }
    };
    const schedule = () => {
      if (stopped) return;
      retry = setTimeout(open, delay);
      delay = Math.min(delay * 2, 60_000);
    };
    void open();
    return () => {
      stopped = true;
      clearTimeout(retry);
      es?.close();
    };
  }

  private signed = new Map<string, { url: string; exp: number }>();

  async signFileUrls(urls: string[]) {
    const out: Record<string, string> = {};
    const need: string[] = [];
    const idOf = (u: string) => /\/files\/([0-9a-f]{32})(?:$|[?#])/.exec(u)?.[1];
    for (const u of urls) {
      const id = idOf(u);
      if (!id) { out[u] = u; continue; }
      const c = this.signed.get(id);
      if (c && c.exp > Date.now() + 60_000) out[u] = c.url;
      else need.push(id);
    }
    if (need.length) {
      const r = await this.call<Record<string, string>>("/files/sign", { ids: [...new Set(need)] });
      for (const [id, url] of Object.entries(r)) this.signed.set(id, { url, exp: Number(/[?&]e=(\d+)/.exec(url)?.[1] ?? 0) * 1000 });
      for (const u of urls) {
        const id = idOf(u);
        if (id && !out[u] && this.signed.get(id)) out[u] = this.signed.get(id)!.url;
      }
    }
    return out;
  }

  async sessions() {
    return this.call<SessionInfo[]>("/auth/sessions");
  }

  async revokeOtherSessions() {
    return this.call<{ revoked: number }>("/auth/sessions/revoke-others", {});
  }

  async upload(file: File): Promise<Attachment> {
    const blob = await shrinkImage(file);
    const form = new FormData();
    form.append("file", blob, file.name);
    await this.ensureToken();
    let res: Response;
    try {
      res = await fetch(`${this.base}/files`, { method: "POST", body: form, headers: this.token ? { Authorization: `Bearer ${this.token}` } : {} });
    } catch {
      throw new CommandError("err.network", {}, 0);
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new CommandError(data?.key ?? "err.network", data?.params ?? {}, res.status);
    return data as Attachment;
  }

  /** Brauzer yopiq bo'lganda ham bildirishnoma (Web Push) uchun. */
  async vapidKey(): Promise<string | null> {
    return this.call<{ key: string | null }>("/push/key").then((r) => r.key).catch(() => null);
  }
  async savePushSubscription(sub: PushSubscriptionJSON, lang: string) {
    await this.call("/push/subscribe", { ...sub, lang });
  }
}

export function createTransport(): Transport {
  const api = process.env.NEXT_PUBLIC_API_URL;
  return api ? new RemoteTransport(api.replace(/\/$/, "")) : new LocalTransport();
}
