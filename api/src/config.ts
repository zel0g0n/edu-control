// Sozlamalar muhit o'zgaruvchilaridan (.env.example ga qarang).
export interface Config {
  port: number;
  /** postgres://... (Neon, lokal Postgres) yoki pglite:./papka (Postgres o'rnatmasdan). */
  databaseUrl: string;
  jwtSecret: string;
  /** Web ilova manzili (CORS va to'lovdan qaytish uchun). */
  webOrigin: string[];
  /** Server ommaviy manzili (fayl havolalari uchun). */
  publicUrl: string;
  /** true: SMS yuborilmaydi, kod javobda qaytadi (faqat sinov uchun!). */
  smsDevMode: boolean;
  eskizEmail?: string;
  eskizPassword?: string;
  eskizFrom: string;
  seedDemo: boolean;
  vapidPublic?: string;
  vapidPrivate?: string;
  vapidSubject: string;
  clickSecretKey?: string;
  clickServiceId?: string;
  paymeKey?: string;
  paymeTestKey?: string;
}

const bool = (v: string | undefined, d = false) => (v === undefined ? d : /^(1|true|yes)$/i.test(v));

/** api/.env faylini (bo'lsa) process.env ga yuklaydi. Tizim o'zgaruvchilari ustun turadi. */
export function loadEnvFile(path = ".env"): void {
  const { existsSync } = require("node:fs") as typeof import("node:fs");
  if (!existsSync(path)) return;
  const before = { ...process.env };
  process.loadEnvFile(path);
  for (const [k, v] of Object.entries(before)) process.env[k] = v;
  // Bo'sh qatorlar ("JWT_SECRET=") o'rnatilmagan deb hisoblanadi
  for (const [k, v] of Object.entries(process.env)) if (v === "" && before[k] === undefined) delete process.env[k];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (env === process.env) loadEnvFile();
  const jwtSecret = env.JWT_SECRET ?? "";
  if (jwtSecret.length < 32 && env.NODE_ENV === "production") throw new Error("JWT_SECRET kamida 32 belgi bo'lishi kerak");
  return {
    port: Number(env.PORT ?? 4000),
    databaseUrl: env.DATABASE_URL ?? "pglite:./data/db",
    jwtSecret: jwtSecret || "dev-secret-faqat-sinov-uchun-dev-secret",
    webOrigin: (env.WEB_ORIGIN ?? "http://localhost:3000").split(",").map((s) => s.trim()).filter(Boolean),
    publicUrl: (env.PUBLIC_URL ?? `http://localhost:${env.PORT ?? 4000}`).replace(/\/$/, ""),
    smsDevMode: bool(env.SMS_DEV_MODE, !env.ESKIZ_EMAIL),
    eskizEmail: env.ESKIZ_EMAIL,
    eskizPassword: env.ESKIZ_PASSWORD,
    eskizFrom: env.ESKIZ_FROM ?? "4546",
    seedDemo: bool(env.SEED_DEMO, false),
    vapidPublic: env.VAPID_PUBLIC_KEY,
    vapidPrivate: env.VAPID_PRIVATE_KEY,
    vapidSubject: env.VAPID_SUBJECT ?? "mailto:admin@example.com",
    clickSecretKey: env.CLICK_SECRET_KEY,
    clickServiceId: env.CLICK_SERVICE_ID,
    paymeKey: env.PAYME_KEY,
    paymeTestKey: env.PAYME_TEST_KEY,
  };
}

export const CONFIG = Symbol("CONFIG");
