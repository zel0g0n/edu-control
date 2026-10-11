// Sozlamalar muhit o'zgaruvchilaridan (.env.example ga qarang).
export interface Config {
  /** production: haqiqiy ma'lumot (qat'iy tekshiruv); pilot: sinov serveri. */
  appEnv: "production" | "pilot";
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
  /** Proksi qatlamlari soni (Render, nginx: 1). */
  trustProxy: number;
  /**
   * true: refresh token httpOnly cookie'da (JavaScript o'qiy olmaydi). Sayt va API bitta domen ostida
   * bo'lishi kerak (app.maktab.uz + api.maktab.uz). false: refresh token brauzer xotirasida (pilot: vercel + onrender).
   */
  authCookie: boolean;
  /** Rahbariyat uchun ikki bosqichli kirish majburiy (production'da standart: ha). */
  requireStaff2fa: boolean;
  /** 2FA kalitlarini shifrlash kaliti (32 bayt, base64). Bo'lmasa JWT_SECRET'dan hosil qilinadi. */
  mfaKey?: Buffer;
  /** So'rov cheklovlarini kengaytirish (faqat testlar: 100). */
  rateLimitScale: number;
}

/** Panelga nusxalashda tez-tez qo'shilib ketadigan "NOM=", qo'shtirnoq va bo'shliqlarni olib tashlaydi. */
function cleanKey(v: string | undefined, name: string): string | undefined {
  const s = v?.trim().replace(new RegExp(`^${name}\\s*=\\s*`), "").replace(/^["']|["']$/g, "").trim();
  return s || undefined;
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

/**
 * APP_ENV=production (haqiqiy o'quvchilar): xavfli sinov sozlamalari bilan server ishga tushmaydi.
 * Pilot/sinov serverida (APP_ENV berilmagan) faqat ogohlantirish.
 */
export function productionProblems(c: Config): string[] {
  const p: string[] = [];
  if (c.seedDemo) p.push("SEED_DEMO=true: demo foydalanuvchilar va ma'lum parol (246810)");
  if (c.smsDevMode) p.push("SMS_DEV_MODE=true: SMS kod javobda ko'rinadi");
  if (c.jwtSecret.length < 32 || c.jwtSecret.startsWith("dev-secret")) p.push("JWT_SECRET kamida 32 belgi, tasodifiy bo'lsin");
  if (c.databaseUrl.startsWith("pglite:") || c.databaseUrl === "memory:") p.push("DATABASE_URL: haqiqiy Postgres kerak (pglite emas)");
  if (!c.publicUrl.startsWith("https://")) p.push("PUBLIC_URL https:// bilan boshlansin");
  if (c.webOrigin.some((o) => !o.startsWith("https://"))) p.push("WEB_ORIGIN faqat https:// manzillar");
  if (c.paymeTestKey) p.push("PAYME_TEST_KEY: haqiqiy serverda test kaliti bo'lmasin");
  if (c.rateLimitScale !== 1) p.push("RATE_LIMIT_SCALE faqat testlar uchun");
  if (!c.requireStaff2fa) p.push("REQUIRE_STAFF_2FA o'chirilgan: rahbariyat uchun ikki bosqichli kirish majburiy bo'lsin");
  if (!c.mfaKey || c.mfaKey.length !== 32) p.push("MFA_KEY (32 bayt, base64) kerak: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"");
  if (!c.authCookie) p.push("AUTH_COOKIE=true kerak (refresh token httpOnly cookie'da; sayt va API bitta domen ostida)");
  return p;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (env === process.env) loadEnvFile();
  const jwtSecret = env.JWT_SECRET ?? "";
  if (jwtSecret.length < 32 && env.NODE_ENV === "production") throw new Error("JWT_SECRET kamida 32 belgi bo'lishi kerak");
  const config = buildConfig(env, jwtSecret);
  if (env.APP_ENV === "production") {
    const problems = productionProblems(config);
    if (problems.length) throw new Error(`APP_ENV=production, lekin sozlamalar xavfli:\n - ${problems.join("\n - ")}`);
  }
  return config;
}

function buildConfig(env: NodeJS.ProcessEnv, jwtSecret: string): Config {
  return {
    appEnv: env.APP_ENV === "production" ? "production" : "pilot",
    port: Number(env.PORT ?? 4000),
    databaseUrl: env.DATABASE_URL ?? "pglite:./data/db",
    jwtSecret: jwtSecret || "dev-secret-faqat-sinov-uchun-dev-secret",
    // "https://sayt.vercel.app/", qo'shtirnoq yoki "WEB_ORIGIN=" bilan nusxalansa ham ishlaydi
    webOrigin: (cleanKey(env.WEB_ORIGIN, "WEB_ORIGIN") ?? "http://localhost:3000")
      .split(",").map((s) => s.trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "")).filter(Boolean),
    // Render o'zi RENDER_EXTERNAL_URL beradi (https://....onrender.com)
    publicUrl: (env.PUBLIC_URL ?? env.RENDER_EXTERNAL_URL ?? `http://localhost:${env.PORT ?? 4000}`).replace(/\/$/, ""),
    smsDevMode: bool(env.SMS_DEV_MODE, !env.ESKIZ_EMAIL),
    eskizEmail: env.ESKIZ_EMAIL,
    eskizPassword: env.ESKIZ_PASSWORD,
    eskizFrom: env.ESKIZ_FROM ?? "4546",
    seedDemo: bool(env.SEED_DEMO, false),
    vapidPublic: cleanKey(env.VAPID_PUBLIC_KEY, "VAPID_PUBLIC_KEY"),
    vapidPrivate: cleanKey(env.VAPID_PRIVATE_KEY, "VAPID_PRIVATE_KEY"),
    vapidSubject: env.VAPID_SUBJECT ?? "mailto:admin@example.com",
    clickSecretKey: env.CLICK_SECRET_KEY,
    clickServiceId: env.CLICK_SERVICE_ID,
    paymeKey: env.PAYME_KEY,
    paymeTestKey: env.PAYME_TEST_KEY,
    trustProxy: Number(env.TRUST_PROXY ?? 1),
    rateLimitScale: Number(env.RATE_LIMIT_SCALE ?? 1),
    authCookie: bool(env.AUTH_COOKIE, false),
    requireStaff2fa: bool(env.REQUIRE_STAFF_2FA, env.APP_ENV === "production"),
    mfaKey: env.MFA_KEY ? Buffer.from(env.MFA_KEY, "base64") : undefined,
  };
}

export const CONFIG = Symbol("CONFIG");
