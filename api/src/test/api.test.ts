import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { invoiceRemaining, type Database, type Patch } from "@edunazorat/shared";

import { createApp } from "../bootstrap";
import { loadConfig } from "../config";
import { connect, type Sql } from "../db/sql";
import { StoreService } from "../store.service";

let app: INestApplication;
let base = "";
let sql: Sql;
const PAYME_KEY = "test-payme-key";
const CLICK_KEY = "test-click-key";

async function call<T = unknown>(path: string, body?: unknown, token?: string, headers: Record<string, string> = {}): Promise<{ status: number; data: T }> {
  const res = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, data: (text ? JSON.parse(text) : null) as T };
}

/** Har bir kirish uchun yangi raqam bilan cheklovga tushmaslik: telefon bo'yicha alohida. */
async function login(phone: string): Promise<string> {
  const r = await call<{ devCode: string }>("/auth/request-code", { phone });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const v = await call<{ token: string }>("/auth/verify-code", { phone, code: r.data.devCode });
  assert.equal(v.status, 200);
  return v.data.token;
}

before(async () => {
  const config = { ...loadConfig({ SEED_DEMO: "true", SMS_DEV_MODE: "true", DATABASE_URL: process.env.TEST_DATABASE_URL ?? "pglite:memory", PAYME_KEY, CLICK_SECRET_KEY: CLICK_KEY } as NodeJS.ProcessEnv), port: 0 };
  sql = await connect(config.databaseUrl);
  app = await createApp(config, sql, ["error"]);
  await app.listen(0, "127.0.0.1");
  const addr = app.getHttpServer().address() as { port: number };
  base = `http://127.0.0.1:${addr.port}`;
  config.publicUrl = base;
});
after(async () => {
  await app.close();
  await sql.close();
});

describe("kirish", () => {
  it("noto'g'ri kod, qayta so'rash cheklovi, to'g'ri kod", async () => {
    const r = await call<{ devCode: string }>("/auth/request-code", { phone: "+998 90 222 22 22" });
    assert.match(r.data.devCode, /^\d{4}$/);
    const again = await call<{ key: string }>("/auth/request-code", { phone: "998902222222" });
    assert.equal(again.status, 429);
    assert.equal(again.data.key, "err.otpWait");
    const bad = await call<{ key: string }>("/auth/verify-code", { phone: "998902222222", code: r.data.devCode === "0000" ? "1111" : "0000" });
    assert.equal(bad.data.key, "err.otp");
    const ok = await call<{ token: string; userId: string }>("/auth/verify-code", { phone: "998902222222", code: r.data.devCode });
    assert.equal(ok.data.userId, "u_dir2");
    const reuse = await call<{ key: string }>("/auth/verify-code", { phone: "998902222222", code: r.data.devCode });
    assert.equal(reuse.data.key, "err.otpExpired");
  });

  it("noma'lum raqam va tokensiz so'rov", async () => {
    assert.equal((await call<{ key: string }>("/auth/request-code", { phone: "998911234567" })).data.key, "err.userNotFound");
    assert.equal((await call("/bootstrap")).status, 401);
    assert.equal((await call("/bootstrap", undefined, "buzilgan.token.x")).status, 401);
  });
});

describe("ma'lumotlar va buyruqlar", () => {
  let parent = "", teacher = "", director = "";
  before(async () => {
    parent = await login("998905555555");
    teacher = await login("998903333333");
    director = await login("998901111111");
  });

  it("bootstrap: ota-ona faqat o'z farzandlarini ko'radi", async () => {
    const r = await call<Database>("/bootstrap", undefined, parent);
    assert.deepEqual(r.data.students.map((s) => s.id).sort(), ["s_a0", "s_b0"]);
    assert.ok(r.data.students.every((s) => s.faceTemplates.length === 0));
    assert.ok(!r.data.users.some((u) => u.role === "director"));
  });

  it("ruxsatsiz buyruq va demo to'lov serverda yo'q", async () => {
    const f = await call<{ key: string }>("/commands/student.archive", { id: "s_a0", archived: true }, parent);
    assert.equal(f.status, 403);
    assert.equal(f.data.key, "err.forbidden");
    const d = await call<{ key: string }>("/commands/payment.demoOnline", { invoiceId: "x", provider: "click" }, parent);
    assert.equal(d.status, 404);
  });

  it("davomat: saqlanadi va ota-onaga real vaqtda (SSE) yetib boradi", async () => {
    const boot = await call<Database>("/bootstrap", undefined, teacher);
    const lesson = boot.data.lessons.find((l) => l.teacherId === "t_math" && l.classId === "c_7b")!;
    // Ota-ona SSE ulanishi
    const ctrl = new AbortController();
    const es = await fetch(`${base}/events?token=${parent}`, { signal: ctrl.signal });
    const reader = es.body!.getReader();
    const received = (async () => {
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return "";
        buf += new TextDecoder().decode(value);
        const m = /event: patch\ndata: (.*)\n\n/.exec(buf);
        if (m) return m[1];
      }
    })();
    await new Promise((r) => setTimeout(r, 100));
    const day = new Date().toISOString().slice(0, 10);
    const res = await call<Patch>("/commands/attendance.mark", { lessonId: lesson.id, day, marks: [{ studentId: "s_b0", status: "late", source: "manual" }] }, teacher);
    assert.equal(res.status, 200);
    // O'qituvchi javobida ota-onaning bildirishnomasi yo'q (ko'rinish qoidasi)
    assert.equal(res.data.upsert?.notifications, undefined);
    const patch = JSON.parse(await Promise.race([received, new Promise<string>((_, rej) => setTimeout(() => rej(new Error("SSE kelmadi")), 3000))])) as Patch;
    ctrl.abort();
    assert.equal(patch.upsert?.attendance?.[0].status, "late");
    assert.equal(patch.upsert?.notifications?.[0].key, "notif.attendance.late");
    // Postgres'da saqlangan: qayta yuklasak ham bor
    const store = app.get(StoreService);
    await store.load();
    assert.ok(store.db.attendance.some((a) => a.lessonId === lesson.id && a.day === day && a.studentId === "s_b0" && a.status === "late"));
  });

  it("direktor o'quvchi qo'shadi, yangi ota-ona kira oladi", async () => {
    const r = await call<Patch>("/commands/student.save", { name: "Server Test", classId: "c_5a", parents: [{ name: "Ona", phone: "998931112233" }] }, director);
    assert.equal(r.status, 200);
    const t = await login("998931112233");
    const b = await call<Database>("/bootstrap", undefined, t);
    assert.deepEqual(b.data.students.map((s) => s.name), ["Server Test"]);
  });

  it("fayl yuklash va yuklab olish", async () => {
    const form = new FormData();
    form.set("file", new Blob(["salom dunyo"], { type: "text/plain" }), "javob.txt");
    const up = await fetch(`${base}/files`, { method: "POST", body: form, headers: { Authorization: `Bearer ${teacher}` } });
    const a = (await up.json()) as { url: string; size: number; name: string };
    assert.equal(up.status, 201);
    assert.equal(a.size, 11);
    const down = await fetch(a.url);
    assert.equal(await down.text(), "salom dunyo");
    assert.equal(down.headers.get("x-content-type-options"), "nosniff");
    const big = new FormData();
    big.set("file", new Blob([new Uint8Array(3 * 1024 * 1024)]), "katta.bin");
    const r = await fetch(`${base}/files`, { method: "POST", body: big, headers: { Authorization: `Bearer ${teacher}` } });
    assert.equal(r.status, 413);
  });
});

describe("to'lov tizimlari", () => {
  const unpaid = () => {
    const db = app.get(StoreService).db;
    return db.invoices.find((i) => invoiceRemaining(i) > 0 && db.students.find((s) => s.id === i.studentId)?.parentIds.length)!;
  };
  const payme = (method: string, params: Record<string, unknown>, key = PAYME_KEY) =>
    call<{ result?: Record<string, unknown>; error?: { code: number } }>("/payments/payme", { id: 1, method, params }, undefined, { Authorization: `Basic ${Buffer.from(`Paycom:${key}`).toString("base64")}` });

  it("Payme: kalit noto'g'ri bo'lsa rad etiladi", async () => {
    assert.equal((await payme("CheckPerformTransaction", {}, "xato")).data.error?.code, -32504);
  });

  it("Payme: tekshirish, yaratish, bajarish, bekor qilish", async () => {
    const inv = unpaid();
    const amount = invoiceRemaining(inv) * 100;
    assert.equal((await payme("CheckPerformTransaction", { amount: amount + 100, account: { order_id: inv.id } })).data.error?.code, -31001);
    assert.equal((await payme("CheckPerformTransaction", { amount, account: { order_id: "yoq" } })).data.error?.code, -31050);
    assert.deepEqual((await payme("CheckPerformTransaction", { amount, account: { order_id: inv.id } })).data.result, { allow: true });
    const now = Date.now();
    const c = await payme("CreateTransaction", { id: "pm1", time: now, amount, account: { order_id: inv.id } });
    assert.equal(c.data.result?.state, 1);
    // Ikkinchi tranzaksiya shu hisobga: band
    assert.equal((await payme("CreateTransaction", { id: "pm2", time: now, amount, account: { order_id: inv.id } })).data.error?.code, -31050);
    const p = await payme("PerformTransaction", { id: "pm1" });
    assert.equal(p.data.result?.state, 2);
    // Takror bajarish: o'sha natija, ikki marta yozilmaydi
    await payme("PerformTransaction", { id: "pm1" });
    const db = app.get(StoreService).db;
    const after = db.invoices.find((i) => i.id === inv.id)!;
    assert.equal(invoiceRemaining(after), 0);
    assert.equal(after.payments.filter((x) => x.externalId === "payme:pm1").length, 1);
    assert.equal((await payme("CheckTransaction", { id: "pm1" })).data.result?.state, 2);
    const cancel = await payme("CancelTransaction", { id: "pm1", reason: 5 });
    assert.equal(cancel.data.result?.state, -2);
    assert.ok(invoiceRemaining(app.get(StoreService).db.invoices.find((i) => i.id === inv.id)!) > 0);
  });

  it("Click: imzo tekshiruvi, prepare va complete", async () => {
    const inv = unpaid();
    const amount = String(invoiceRemaining(inv));
    const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
    const post = async (path: string, o: Record<string, string>) => {
      const r = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form(o) });
      return (await r.json()) as { error: number; merchant_prepare_id?: string };
    };
    const t = "777", sid = "123", time = "2026-10-08 10:00:00";
    const signP = createHash("md5").update(`${t}${sid}${CLICK_KEY}${inv.id}${amount}0${time}`).digest("hex");
    const bad = await post("/payments/click/prepare", { click_trans_id: t, service_id: sid, merchant_trans_id: inv.id, amount, action: "0", error: "0", sign_time: time, sign_string: "x".repeat(32) });
    assert.equal(bad.error, -1);
    const prep = await post("/payments/click/prepare", { click_trans_id: t, service_id: sid, merchant_trans_id: inv.id, amount, action: "0", error: "0", sign_time: time, sign_string: signP });
    assert.equal(prep.error, 0);
    const signC = createHash("md5").update(`${t}${sid}${CLICK_KEY}${inv.id}${prep.merchant_prepare_id}${amount}1${time}`).digest("hex");
    const done = await post("/payments/click/complete", { click_trans_id: t, service_id: sid, merchant_trans_id: inv.id, merchant_prepare_id: prep.merchant_prepare_id!, amount, action: "1", error: "0", sign_time: time, sign_string: signC });
    assert.equal(done.error, 0);
    assert.equal(invoiceRemaining(app.get(StoreService).db.invoices.find((i) => i.id === inv.id)!), 0);
    const parentNote = app.get(StoreService).db.notifications.find((n) => n.key === "notif.payment" && n.params.method === "click");
    assert.ok(parentNote);
  });
});

describe("bloklangan muassasa", () => {
  it("foydalanuvchi kira olmaydi va eski tokeni ishlamaydi", async () => {
    const tok = await login("998907777771");
    const admin = await login("998900000000");
    assert.equal((await call("/commands/institution.setActive", { id: "inst_center", active: false }, admin)).status, 200);
    assert.equal((await call("/bootstrap", undefined, tok)).status, 403);
    assert.equal((await call<{ key: string }>("/auth/request-code", { phone: "998907777772" })).data.key, "err.institutionBlocked");
  });
});
