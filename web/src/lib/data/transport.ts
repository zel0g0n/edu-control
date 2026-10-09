import {
  CommandError,
  applyPatch,
  executeCommand,
  findLoginUser,
  scopeDatabase,
  scopePatch,
  seedDatabase,
  verifyLogin,
  newId,
  type Attachment,
  type CommandMap,
  type CommandName,
  type Database,
  type Patch,
} from "@edunazorat/shared";

/** Serverdan kelgan real vaqt hodisasi (boshqa foydalanuvchi o'zgartirdi). */
export type LiveEvent = { type: "patch"; patch: Patch } | { type: "reload" };

/** Ma'lumot manbai: demo (brauzer) yoki NestJS API. */
export interface Transport {
  mode: "local" | "remote";
  requestCode(phone: string): Promise<{ devCode?: string }>;
  verifyCode(phone: string, code: string): Promise<string>;
  bootstrap(userId: string): Promise<Database>;
  command<K extends CommandName>(name: K, input: CommandMap[K]): Promise<Patch>;
  signOut(): Promise<void>;
  /** Boshqa oyna/qurilmadagi o'zgarishlar. */
  listen(fn: (e: LiveEvent) => void): () => void;
  /** Fayl yuklash (vazifa ilovasi). */
  upload(file: File): Promise<Attachment>;
  resetDemo?(): Promise<void>;
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

/**
 * Demo rejimi: "server" brauzerning o'zida, ma'lumotlar localStorage'da.
 * Buyruqlar NestJS serverdagi bilan bir xil kod (shared/server) orqali bajariladi
 * va foydalanuvchi faqat o'ziga ruxsat etilgan ma'lumotni oladi (shared/scope).
 */
export class LocalTransport implements Transport {
  mode = "local" as const;
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

  private get data(): Database {
    if (this.db && !this.syncWrites) return this.db;
    try {
      const raw = this.storage?.getItem(DB_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Database;
        if (parsed.version === 2) return (this.db = parsed);
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

  async verifyCode(phone: string, code: string) {
    const u = verifyLogin(this.data, phone, code);
    this.actorId = u.id;
    return u.id;
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
    return scopePatch(db, actor, patch);
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
    this.flush();
  }
}

const TOKEN_KEY = "edunazorat-token";

/** NestJS API (NEXT_PUBLIC_API_URL berilganda). */
export class RemoteTransport implements Transport {
  mode = "remote" as const;
  private token: string | null = null;

  constructor(private readonly base: string) {
    try {
      this.token = window.localStorage.getItem(TOKEN_KEY);
    } catch {
      this.token = null;
    }
  }

  private async call<T>(path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new CommandError("err.network", {}, 0);
    }
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) throw new CommandError(data?.key ?? "err.network", data?.params ?? {}, res.status);
    return data as T;
  }

  async requestCode(phone: string) {
    return this.call<{ devCode?: string }>("/auth/request-code", { phone });
  }

  async verifyCode(phone: string, code: string) {
    const r = await this.call<{ token: string; userId: string }>("/auth/verify-code", { phone, code });
    this.token = r.token;
    try {
      window.localStorage.setItem(TOKEN_KEY, r.token);
    } catch {
      // token faqat shu oynada
    }
    return r.userId;
  }

  async bootstrap() {
    if (!this.token) throw new CommandError("err.forbidden", {}, 401);
    return this.call<Database>("/bootstrap");
  }

  async command<K extends CommandName>(name: K, input: CommandMap[K]) {
    return this.call<Patch>(`/commands/${name}`, input);
  }

  async signOut() {
    if (this.token) await this.call("/auth/sign-out", {}).catch(() => undefined);
    this.token = null;
    try {
      window.localStorage.removeItem(TOKEN_KEY);
    } catch {
      // yo'q
    }
  }

  listen(fn: (e: LiveEvent) => void) {
    if (!this.token || typeof EventSource === "undefined") return () => {};
    // Server-Sent Events: token so'rov qatorida (EventSource sarlavha yubora olmaydi).
    const es = new EventSource(`${this.base}/events?token=${encodeURIComponent(this.token)}`);
    es.addEventListener("patch", (e) => fn({ type: "patch", patch: JSON.parse((e as MessageEvent).data) }));
    es.addEventListener("reload", () => fn({ type: "reload" }));
    return () => es.close();
  }

  async upload(file: File): Promise<Attachment> {
    const blob = await shrinkImage(file);
    const form = new FormData();
    form.append("file", blob, file.name);
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
