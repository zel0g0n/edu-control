import {
  CommandError,
  unpackDatabase,
  unpackPatch,
  type AppUser,
  type AttendanceRecord,
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
  /** Boshlang'ich yuklashdagi oynadan oldingi davomat (ko'rinish qoidalari bilan). */
  attendanceRange(from: string, to: string): Promise<AttendanceRecord[]>;
  /** Shu kishining profillari (bir telefon, bir muassasa: o'qituvchi + ota-ona va h.k.). */
  profiles(): Promise<ProfileInfo[]>;
  /** Boshqa profilga o'tish (joriy sessiya yopiladi). */
  switchProfile(userId: string): Promise<SignInResult>;
}

export interface ProfileInfo {
  id: string;
  name: string;
  role: AppUser["role"];
  institution: string;
  current: boolean;
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
export async function shrinkImage(file: File): Promise<Blob> {
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

export function readDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
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
    const isAuth = path.startsWith("/auth/") && !["/auth/sessions", "/auth/sessions/revoke-others", "/auth/profiles", "/auth/sign-out", "/auth/password/reset", "/auth/password/change", "/auth/credentials/status"].includes(path) && !path.startsWith("/auth/mfa/");
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
    // Yuz namunalari tarmoqda ixcham keladi (int8): bu yerda asl ko'rinishga
    return unpackDatabase(await this.call<Database>("/bootstrap"));
  }

  async command<K extends CommandName>(name: K, input: CommandMap[K]) {
    return unpackPatch(await this.call<Patch>(`/commands/${name}`, input));
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
        es.addEventListener("patch", (e) => fn({ type: "patch", patch: unpackPatch(JSON.parse((e as MessageEvent).data)) }));
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
  /** Bir vaqtda so'ralgan fayllar (masalan, ro'yxatdagi 30 ta yuz kesimi) bitta so'rovga yig'iladi. */
  private signQueue: { ids: Set<string>; done: Promise<void> } | null = null;

  private requestSign(ids: string[]): Promise<void> {
    if (!this.signQueue) {
      const q = { ids: new Set<string>(), done: Promise.resolve() };
      q.done = new Promise<void>((resolve) => setTimeout(resolve, 15)).then(async () => {
        if (this.signQueue === q) this.signQueue = null;
        const all = [...q.ids];
        for (let i = 0; i < all.length; i += 100) {
          const r = await this.call<Record<string, string>>("/files/sign", { ids: all.slice(i, i + 100) });
          for (const [id, url] of Object.entries(r)) this.signed.set(id, { url, exp: Number(/[?&]e=(\d+)/.exec(url)?.[1] ?? 0) * 1000 });
        }
      });
      this.signQueue = q;
    }
    for (const id of ids) this.signQueue.ids.add(id);
    return this.signQueue.done;
  }

  async signFileUrls(urls: string[]) {
    const out: Record<string, string> = {};
    const need: string[] = [];
    const idOf = (u: string) => /\/files\/([0-9a-f]{32})(?:$|[?#])/.exec(u)?.[1];
    const fresh = (id: string) => {
      const c = this.signed.get(id);
      return c && c.exp > Date.now() + 60_000 ? c.url : undefined;
    };
    for (const u of urls) {
      const id = idOf(u);
      if (!id) { out[u] = u; continue; }
      const f = fresh(id);
      if (f) out[u] = f;
      else need.push(id);
    }
    if (need.length) {
      await this.requestSign(need);
      for (const u of urls) {
        const id = idOf(u);
        const f = id ? fresh(id) : undefined;
        if (f && !out[u]) out[u] = f;
      }
    }
    return out;
  }

  async sessions() {
    return this.call<SessionInfo[]>("/auth/sessions");
  }

  async profiles() {
    return this.call<ProfileInfo[]>("/auth/profiles");
  }

  async attendanceRange(from: string, to: string) {
    return this.call<AttendanceRecord[]>(`/attendance?from=${from}&to=${to}`);
  }

  async switchProfile(userId: string): Promise<SignInResult> {
    await this.ensureToken();
    // cookie rejimida server yangi refresh cookie'ni o'rnatadi
    const r = await RemoteTransport.parse<TokenResponse>(await this.raw("/auth/profiles/switch", { userId }, true, this.cookieMode));
    this.keep(r);
    return { userId: r.userId };
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

/**
 * Server manzili berilgan bo'lsa — API. Aks holda demo (butun "server" brauzerda): uning kodi
 * (demo ma'lumotlar, buyruqlar, tekshiruv sxemalari) faqat shu holatda alohida yuklanadi.
 */
export async function createTransport(): Promise<Transport> {
  const api = process.env.NEXT_PUBLIC_API_URL;
  if (api) return new RemoteTransport(api.replace(/\/$/, ""));
  const { LocalTransport } = await import("./local-transport");
  return new LocalTransport();
}
