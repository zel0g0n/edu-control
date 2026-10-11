// Bir nechta server nusxasi (load balancer ortida) bitta Postgres bilan.
// Haqiqiy Postgres kerak (CLUSTER_DATABASE_URL): PGlite bitta ulanish bo'lgani uchun nusxalarni
// (alohida ulanishlar, advisory lock, NOTIFY) to'g'ri taqlid qilmaydi. CI'da Postgres xizmati bilan ishlaydi.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { totpCode, totpStep, type Database, type Patch } from "@edunazorat/shared";

import { createApp } from "../bootstrap";
import { loadConfig } from "../config";
import { connect, type Sql } from "../db/sql";
import { StoreService } from "../store.service";

const URL_ = process.env.CLUSTER_DATABASE_URL ?? "";
const real = URL_.startsWith("postgres");
const skip = real ? false : "CLUSTER_DATABASE_URL berilmagan (haqiqiy Postgres kerak)";

interface Node { app: INestApplication; sql: Sql; base: string }
const nodes: Node[] = [];

async function start(): Promise<Node> {
  const config = { ...loadConfig({ SEED_DEMO: "true", SMS_DEV_MODE: "true", DATABASE_URL: URL_, RATE_LIMIT_SCALE: "100", JWT_SECRET: "cluster-test-secret-cluster-test-secret-0123" } as NodeJS.ProcessEnv), port: 0 };
  // Haqiqiy Postgres: har nusxa o'z ulanish pulida (alohida jarayonlar kabi). PGlite: bitta baza.
  const sql = await connect(URL_);
  const app = await createApp(config, sql, ["error"]);
  await app.listen(0, "127.0.0.1");
  const base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  return { app, sql, base };
}

async function call<T>(n: Node, path: string, body?: unknown, token?: string): Promise<{ status: number; data: T }> {
  const r = await fetch(n.base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  return { status: r.status, data: (text ? JSON.parse(text) : null) as T };
}

const loginOn = async (n: Node, login: string) => {
  const r = await call<{ token: string; refreshToken: string }>(n, "/auth/login", { login, password: "246810" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
};

/** Shart bajarilguncha kutish (NOTIFY yetib borishi uchun). */
async function until(fn: () => Promise<boolean> | boolean, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.fail("kutilgan holat bo'lmadi");
}

before(async () => {
  if (!real) return;
  {
    // Toza baza
    const s = await connect(URL_);
    for (const t of ["records", "patch_log", "sessions", "credentials", "mfa", "rate_limits", "otp_codes", "event_tickets", "audit_log", "files", "push_subscriptions"]) {
      await s.query(`DROP TABLE IF EXISTS ${t} CASCADE`).catch(() => undefined);
    }
    await s.close();
  }
  // Ikki nusxa bir vaqtda ishga tushadi (bo'sh bazada demo bir marta yozilishi kerak)
  nodes.push(...(await Promise.all([start(), start()])));
});

after(async () => {
  for (const n of nodes) await n.app.close();
  for (const n of nodes) await n.sql.close();
});

describe("bir nechta server nusxasi", { skip }, () => {
  it("bir vaqtda ishga tushganda demo ma'lumot bir marta yoziladi", async () => {
    const [a, b] = nodes;
    const [{ n }] = await a.sql.query<{ n: string }>("SELECT count(*) AS n FROM records WHERE collection = 'users'");
    assert.equal(Number(n), a.app.get(StoreService).db.users.length);
    assert.equal(a.app.get(StoreService).db.users.length, b.app.get(StoreService).db.users.length);
  });

  it("A dagi o'zgarish B ning xotirasiga va B dagi real vaqt ulanishiga yetadi", async () => {
    const [a, b] = nodes;
    const adm = await loginOn(a, "908888888");
    const parent = await loginOn(b, "905555555");
    // Ota-ona B ga real vaqtda ulangan
    const tk = await call<{ ticket: string }>(b, "/events/ticket", {}, parent.token);
    const ctrl = new AbortController();
    const es = await fetch(`${b.base}/events?ticket=${tk.data.ticket}`, { signal: ctrl.signal });
    const reader = es.body!.getReader();
    const got = (async () => {
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return "";
        buf += new TextDecoder().decode(value);
        const m = /event: patch\ndata: (.*)\n\n/.exec(buf);
        if (m) return m[1];
      }
    })();
    // O'qituvchi A da davomat oladi
    const t = await loginOn(a, "903333333");
    const boot = await call<Database>(a, "/bootstrap", undefined, t.token);
    const lesson = boot.data.lessons.find((l) => l.teacherId === "t_math" && l.classId === "c_7b")!;
    const day = new Date().toISOString().slice(0, 10);
    assert.equal((await call(a, "/commands/attendance.mark", { lessonId: lesson.id, day, marks: [{ studentId: "s_b0", status: "absent", source: "manual" }] }, t.token)).status, 200);
    const patch = JSON.parse(await Promise.race([got, new Promise<string>((_, rej) => setTimeout(() => rej(new Error("B ga yetmadi")), 5000))])) as Patch;
    ctrl.abort();
    assert.equal(patch.upsert?.attendance?.[0].status, "absent");
    // B ning xotirasida ham
    await until(() => b.app.get(StoreService).db.attendance.some((x) => x.lessonId === lesson.id && x.day === day && x.status === "absent"));
    // Lid A da yaratiladi → B dagi administrator ko'radi
    const lead = await call<{ upsert: { leads: { id: string }[] } }>(a, "/commands/lead.save", { name: "Klaster Lid", phone: "90 111 99 88", interest: "", source: "other" }, adm.token);
    const id = lead.data.upsert.leads[0].id;
    const admB = await loginOn(b, "908888888");
    await until(async () => (await call<Database>(b, "/bootstrap", undefined, admB.token)).data.leads.some((l) => l.id === id));
  });

  it("ikki nusxada parallel buyruqlar: hammasi saqlanadi, Kvitansiya ID va loginlar takrorlanmaydi", async () => {
    const [a, b] = nodes;
    const ta = (await loginOn(a, "908888888")).token;
    const tb = (await loginOn(b, "908888888")).token;
    const results = await Promise.all(Array.from({ length: 16 }, (_, i) =>
      call<{ upsert: { students: { id: string }[] } }>(i % 2 ? b : a, "/commands/student.save", { name: "Parallel Talaba", classId: "c_ielts", adult: true, parents: [] }, i % 2 ? tb : ta)));
    assert.ok(results.every((r) => r.status === 200), JSON.stringify(results.find((r) => r.status !== 200)?.data));
    await until(() => {
      const sa = a.app.get(StoreService).db.students;
      const sb = b.app.get(StoreService).db.students;
      return sa.length === sb.length && sa.filter((s) => s.name === "Parallel Talaba").length === 16;
    });
    const db = a.app.get(StoreService).db;
    const rids = db.students.map((s) => s.receiptId).filter(Boolean);
    assert.equal(new Set(rids).size, rids.length);
    const logins = db.users.map((u) => u.login).filter(Boolean);
    assert.equal(new Set(logins).size, logins.length);
    // Ikkala nusxa xotirasi bir xil
    const key = (d: Database) => JSON.stringify(d.students.map((s) => [s.id, s.receiptId, s.classId]).sort());
    assert.equal(key(a.app.get(StoreService).db), key(b.app.get(StoreService).db));
  });

  it("sessiya: A da kirib B da ishlaydi; A da chiqilsa B da darhol bekor; refresh va chipta istalgan nusxada", async () => {
    const [a, b] = nodes;
    const s = await loginOn(a, "905555555");
    assert.equal((await call(b, "/bootstrap", undefined, s.token)).status, 200);
    // Refresh B da, chipta A da olinib B da ishlatiladi
    const r = await call<{ token: string; refreshToken: string }>(b, "/auth/refresh", { refreshToken: s.refreshToken });
    assert.equal(r.status, 200);
    const tk = await call<{ ticket: string }>(a, "/events/ticket", {}, r.data.token);
    const ctrl = new AbortController();
    const ev = await fetch(`${b.base}/events?ticket=${tk.data.ticket}`, { signal: ctrl.signal });
    assert.equal(ev.status, 200);
    ctrl.abort();
    // Eski refresh token (A dan) endi B da ham, A da ham ishlamaydi (poyga oynasidan keyin: o'g'irlik)
    assert.equal((await call(a, "/auth/refresh", { refreshToken: s.refreshToken })).status, 409);
    // A da chiqish → B da darhol
    assert.equal((await call(b, "/bootstrap", undefined, r.data.token)).status, 200);
    assert.equal((await call(a, "/auth/sign-out", {}, r.data.token)).status, 204);
    await until(async () => (await call(b, "/bootstrap", undefined, r.data.token)).status === 401, 2000);
  });

  it("parol A da tiklansa B dagi eski token ishlamaydi; login blok hisoblagichi umumiy", async () => {
    const [a, b] = nodes;
    const teacher = await loginOn(b, "903333333");
    const adm = await loginOn(a, "907777777");
    assert.equal((await call(a, "/auth/password/reset", { userId: "t_math" }, adm.token)).status, 200);
    await until(async () => (await call(b, "/bootstrap", undefined, teacher.token)).status === 401, 2000);
    // 10 xato urinish: 5 tasi A da, 5 tasi B da → keyingisi ikkalasida ham bloklangan
    for (let i = 0; i < 10; i++) await call(i % 2 ? b : a, "/auth/login", { login: "906666662", password: `00000${i}` });
    const r1 = await call<{ key: string }>(a, "/auth/login", { login: "906666662", password: "246810" });
    const r2 = await call<{ key: string }>(b, "/auth/login", { login: "906666662", password: "246810" });
    assert.equal(r1.data.key, "err.loginBlocked");
    assert.equal(r2.data.key, "err.loginBlocked");
  });

  it("2FA A da yoqilsa B da kirishda kod so'raladi", async () => {
    const [a, b] = nodes;
    const d = await loginOn(a, "902222222");
    const s = await call<{ secret: string }>(a, "/auth/mfa/setup", {}, d.token);
    assert.equal((await call(a, "/auth/mfa/enable", { code: await totpCode(s.data.secret, totpStep(Date.now())) }, d.token)).status, 200);
    await until(async () => (await call<{ mfaRequired?: boolean }>(b, "/auth/login", { login: "902222222", password: "246810" })).data.mfaRequired === true, 2000);
  });
});
