import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { addDays, invoiceRemaining, totpCode, totpStep, type Database, type NvrLesson, type NvrRoster, type Patch } from "@edunazorat/shared";

import { createApp } from "../bootstrap";
import { LimitsService } from "../limits.service";
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
const tokenCache = new Map<string, string>();
async function login(phone: string): Promise<string> {
  const cached = tokenCache.get(phone);
  if (cached) return cached;
  const r = await call<{ devCode: string }>("/auth/request-code", { phone });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const v = await call<{ token: string }>("/auth/verify-code", { phone, code: r.data.devCode });
  assert.equal(v.status, 200);
  tokenCache.set(phone, v.data.token);
  return v.data.token;
}

before(async () => {
  const config = { ...loadConfig({ SEED_DEMO: "true", SMS_DEV_MODE: "true", DATABASE_URL: process.env.TEST_DATABASE_URL ?? "pglite:memory", PAYME_KEY, CLICK_SECRET_KEY: CLICK_KEY, RATE_LIMIT_SCALE: "100" } as NodeJS.ProcessEnv), port: 0 };
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
  let parent = "", teacher = "", director = "", admin = "";
  before(async () => {
    parent = await login("998905555555");
    teacher = await login("998903333333");
    director = await login("998901111111");
    admin = await login("998907777777");
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
    // Token URL'da qabul qilinmaydi; bir martalik chipta kerak
    assert.equal((await fetch(`${base}/events?token=${parent}`)).status, 401);
    const tk = await call<{ ticket: string }>("/events/ticket", {}, parent);
    const es = await fetch(`${base}/events?ticket=${tk.data.ticket}`, { signal: ctrl.signal });
    // Chipta ikkinchi marta ishlamaydi
    assert.equal((await fetch(`${base}/events?ticket=${tk.data.ticket}`)).status, 401);
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
    const r = await call<Patch>("/commands/student.save", { name: "Server Test", classId: "c_5a", parents: [{ name: "Ona", phone: "998931112233" }] }, admin);
    assert.equal(r.status, 200);
    const t = await login("998931112233");
    const b = await call<Database>("/bootstrap", undefined, t);
    assert.deepEqual(b.data.students.map((s) => s.name), ["Server Test"]);
  });

  it("fayl yuklash va yuklab olish", async () => {
    const form = new FormData();
    form.set("file", new Blob(["salom dunyo"], { type: "text/plain" }), "javob.txt");
    const up = await fetch(`${base}/files`, { method: "POST", body: form, headers: { Authorization: `Bearer ${teacher}` } });
    const a = (await up.json()) as { id: string; url: string; size: number; name: string };
    assert.equal(up.status, 201);
    assert.equal(a.size, 11);
    // Imzosiz havola ochilmaydi
    assert.equal((await fetch(a.url)).status, 401);
    const fid = /\/files\/([0-9a-f]{32})/.exec(a.url)![1];
    const signed = await call<Record<string, string>>("/files/sign", { ids: [fid] }, teacher);
    const down = await fetch(signed.data[fid]);
    assert.equal(await down.text(), "salom dunyo");
    assert.equal(down.headers.get("x-content-type-options"), "nosniff");
    // Boshqa foydalanuvchiga imzo berilmaydi (fayl unga ko'rinmaydi)
    const other = await call<Record<string, string>>("/files/sign", { ids: [fid] }, parent);
    assert.deepEqual(other.data, {});
    // Imzoni boshqa foydalanuvchiga yoki muddatga o'zgartirib bo'lmaydi
    const u = new URL(signed.data[fid]);
    u.searchParams.set("u", "u_parent");
    assert.equal((await fetch(u)).status, 401);
    const u2 = new URL(signed.data[fid]);
    u2.searchParams.set("e", String(Number(u2.searchParams.get("e")) + 3600));
    assert.equal((await fetch(u2)).status, 401);
    // Vazifaga biriktirilsa, sinf o'quvchisining ota-onasi ham ocha oladi
    const hw = await call<{ upsert: { homeworks: { id: string }[] } }>("/commands/homework.save", { classId: "c_7b", subject: "Matematika", title: "Fayl bilan", description: "", dueDay: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10), attachments: [{ id: "f1", name: a.name, type: "text/plain", size: a.size, url: a.url }] }, teacher);
    assert.equal(hw.status, 200);
    const forParent = await call<Record<string, string>>("/files/sign", { ids: [fid] }, parent);
    assert.equal(await (await fetch(forParent.data[fid])).text(), "salom dunyo");
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

  it("Payme: Kvitansiya ID bilan eng eski qarz to'lanadi", async () => {
    const db = app.get(StoreService).db;
    const inv = unpaid();
    const s = db.students.find((x) => x.id === inv.studentId)!;
    assert.match(s.receiptId ?? "", /^[1-9]\d{5}$/);
    const oldest = db.invoices.filter((i) => i.studentId === s.id && invoiceRemaining(i) > 0).sort((a, b) => a.month.localeCompare(b.month))[0];
    const amount = invoiceRemaining(oldest) * 100;
    // "104 523" ko'rinishida (bo'shliq bilan) kiritilsa ham topiladi
    const spaced = `${s.receiptId!.slice(0, 3)} ${s.receiptId!.slice(3)}`;
    assert.deepEqual((await payme("CheckPerformTransaction", { amount, account: { order_id: spaced } })).data.result, { allow: true });
    assert.equal((await payme("CheckPerformTransaction", { amount, account: { order_id: "000001" } })).data.error?.code, -31050);
    const c = await payme("CreateTransaction", { id: "pmr1", time: Date.now(), amount, account: { order_id: s.receiptId } });
    assert.equal(c.data.result?.state, 1);
    assert.equal((await payme("PerformTransaction", { id: "pmr1" })).data.result?.state, 2);
    assert.equal(invoiceRemaining(app.get(StoreService).db.invoices.find((i) => i.id === oldest.id)!), 0);
  });

  it("Kvitansiya ID: hamma o'quvchida bor va takrorlanmaydi", async () => {
    const ids = app.get(StoreService).db.students.map((s) => s.receiptId);
    assert.ok(ids.every((x) => x && /^[1-9]\d{5}$/.test(x)));
    assert.equal(new Set(ids).size, ids.length);
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

describe("NVR integratsiyasi", () => {
  const key = "edn_" + "ab12".repeat(12);
  const nvr = <T = unknown>(path: string, body?: unknown, k = key) => call<T>(`/integrations/nvr/v1${path}`, body, k);
  let director = "", teacher = "";
  // NVR sozlamasini administrator boshqaradi
  before(async () => {
    director = await login("998907777777");
    teacher = await login("998903333333");
  });

  it("kalitsiz/noto'g'ri kalit rad etiladi, faqat direktor sozlaydi", async () => {
    assert.equal((await nvr("/ping", undefined, "edn_" + "0".repeat(48))).status, 401);
    assert.equal((await call("/integrations/nvr/v1/ping")).status, 401);
    const keyHash = createHash("sha256").update(key).digest("hex");
    assert.equal((await call("/commands/nvr.configure", { enabled: true, keyHash, keyPrefix: key.slice(0, 8) }, teacher)).status, 403);
    assert.equal((await call("/commands/nvr.configure", { enabled: true, keyHash, keyPrefix: key.slice(0, 8) }, director)).status, 200);
    const p = await nvr<{ ok: boolean; institution: { id: string } }>("/ping");
    assert.equal(p.status, 200);
    assert.equal(p.data.institution.id, "inst_school");
    // Kalit xeshi boshqa rollarga ko'rinmaydi
    const boot = await call<Database>("/bootstrap", undefined, teacher);
    assert.equal(boot.data.institutions[0].settings.nvr, undefined);
  });

  it("ro'yxat, jadval va dars davomati (o'qituvchi belgisi ustun)", async () => {
    const roster = await nvr<NvrRoster>("/roster");
    assert.ok(roster.data.students.length > 5);
    assert.ok(!JSON.stringify(roster.data).includes("998"), "telefon raqamlari chiqmasligi kerak");
    // Kelgusi hafta: hali hech kim belgilamagan kun
    let day = "", lesson: NvrLesson | undefined;
    const today = new Date().toISOString().slice(0, 10);
    for (let i = 7; i < 14 && !lesson; i++) {
      day = addDays(today, i);
      const s = await nvr<{ lessons: NvrLesson[] }>(`/schedule?day=${day}`);
      lesson = s.data.lessons.find((l) => l.teacher === "Dilnoza Karimova");
    }
    assert.ok(lesson, "dars topilmadi");
    const kids = roster.data.students.filter((s) => s.classId === lesson!.classId);
    // O'qituvchi bir o'quvchini o'zi belgilaydi
    assert.equal((await call("/commands/attendance.mark", { lessonId: lesson!.id, day, marks: [{ studentId: kids[0].id, status: "absent", source: "manual" }] }, teacher)).status, 200);
    const r = await nvr<{ applied: number; skipped: { studentId: string; reason: string }[] }>("/attendance", {
      lessonId: lesson!.id, day, cameraId: "xona-204",
      marks: [
        { studentId: kids[0].id, status: "present", confidence: 0.9 },
        { studentId: kids[1].id, status: "present", confidence: 0.82, seenAt: Date.now(), snapshot: "data:image/jpeg;base64,AAAA" },
        { studentId: "s_begona", status: "present" },
      ],
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.applied, 1);
    assert.deepEqual(r.data.skipped.map((x) => x.reason).sort(), ["teacherMarked", "unknownStudent"]);
    const db = app.get(StoreService).db;
    const rec = db.attendance.find((a) => a.studentId === kids[1].id && a.lessonId === lesson!.id && a.day === day)!;
    assert.equal(rec.source, "nvr");
    assert.equal(db.attendance.find((a) => a.studentId === kids[0].id && a.lessonId === lesson!.id && a.day === day)!.status, "absent");
    const parents = db.students.find((s) => s.id === kids[1].id)!.parentIds;
    assert.ok(db.notifications.some((n) => parents.includes(n.userId) && n.key === "notif.attendance.present.face" && n.image));
    // Noto'g'ri kun (jadvalda shu kuni bu dars yo'q)
    assert.equal((await nvr("/attendance", { lessonId: lesson!.id, day: addDays(day, 1), marks: [{ studentId: kids[1].id, status: "present" }] })).status, 400);
  });

  it("kalit bekor qilinsa ishlamaydi", async () => {
    assert.equal((await call("/commands/nvr.configure", { enabled: false, revoke: true }, director)).status, 200);
    assert.equal((await nvr("/ping")).status, 401);
  });
});

describe("bloklangan muassasa", () => {
  it("foydalanuvchi kira olmaydi va eski tokeni ishlamaydi", async () => {
    const tok = await login("998907777771");
    const admin = await login("998900000000");
    assert.equal((await call("/commands/institution.setActive", { id: "inst_center", active: false }, admin)).status, 200);
    assert.equal((await call("/bootstrap", undefined, tok)).status, 403);
    assert.equal((await call<{ key: string }>("/auth/request-code", { phone: "998907777772" })).data.key, "err.institutionBlocked");
    // Keyingi testlar uchun qayta ochiladi
    assert.equal((await call("/commands/institution.setActive", { id: "inst_center", active: true }, admin)).status, 200);
  });
});

describe("login va parol", () => {
  it("demo parol, xato urinish, telefon va ism.familiya bilan kirish", async () => {
    const bad = await call<{ key: string }>("/auth/login", { login: "903333333", password: "000000" });
    assert.equal(bad.status, 401);
    assert.equal(bad.data.key, "err.badLogin");
    const ok = await call<{ token: string; userId: string; mustChange: boolean }>("/auth/login", { login: "+998 90 333 33 33", password: "246810" });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    assert.equal(ok.data.userId, "t_math");
    const st = await call<{ userId: string }>("/auth/login", { login: "Kamila.Karimova", password: "246810" });
    assert.equal(st.data.userId, "u_student");
    // Noma'lum login ham xuddi shu xato (login borligini bildirmaydi)
    assert.equal((await call<{ key: string }>("/auth/login", { login: "yoq.odam", password: "246810" })).data.key, "err.badLogin");
    // Parol hech qachon mijozga yuborilmaydi
    const b = await call<Database>("/bootstrap", undefined, ok.data.token);
    assert.ok(!JSON.stringify(b.data).includes("scrypt$"));
  });

  it("administrator parol beradi, eski sessiya bekor bo'ladi, birinchi kirishda almashtiriladi", async () => {
    const admin = await login("998907777777");
    const db = app.get(StoreService).db;
    const acc = db.users.find((u) => u.role === "student" && u.institutionId === "inst_school" && u.id !== "u_student")!;
    assert.match(acc.login ?? "", /^[a-z]+\.[a-z]+\d*$/);
    const r = await call<{ login: string; password: string }>("/auth/password/reset", { userId: acc.id }, admin);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.login, acc.login);
    assert.match(r.data.password, /^\d{6}$/);
    const first = await call<{ token: string; mustChange: boolean }>("/auth/login", { login: acc.login, password: r.data.password });
    assert.equal(first.data.mustChange, true);
    // O'zi almashtiradi: oson parol rad etiladi
    assert.equal((await call<{ key: string }>("/auth/password/change", { current: r.data.password, next: "123456" }, first.data.token)).data.key, "err.passwordWeak");
    assert.equal((await call("/auth/password/change", { current: r.data.password, next: "yangiParol7" }, first.data.token)).status, 200);
    const again = await call<{ token: string; mustChange: boolean }>("/auth/login", { login: acc.login, password: "yangiParol7" });
    assert.equal(again.data.mustChange, false);
    // Administrator yana parol bersa: oldingi token ishlamaydi
    await call("/auth/password/reset", { userId: acc.id }, admin);
    const expired = await call<{ key: string }>("/bootstrap", undefined, again.data.token);
    assert.equal(expired.status, 401);
    assert.equal(expired.data.key, "err.sessionExpired");
  });

  it("kim kimga parol bera oladi", async () => {
    const admin = await login("998907777777");
    const director = await login("998901111111");
    const teacher = await login("998903333333");
    // O'qituvchi hech kimga parol bera olmaydi
    assert.equal((await call("/auth/password/reset", { userId: "u_parent" }, teacher)).status, 403);
    // Administrator boshqa administratorga yoki direktorga bera olmaydi
    assert.equal((await call("/auth/password/reset", { userId: "u_dir" }, admin)).status, 403);
    // Direktor faqat administratorga beradi
    assert.equal((await call("/auth/password/reset", { userId: "t_math" }, director)).status, 403);
    const r = await call<{ password: string }>("/auth/password/reset", { userId: "u_adm" }, director);
    assert.equal(r.status, 200);
    // Direktor o'quvchi qo'sha olmaydi (faqat ko'radi)
    const deny = await call<{ key: string }>("/commands/student.save", { name: "X", classId: "c_5a", parents: [] }, director);
    assert.equal(deny.status, 403);
  });

  it("10 ta xato urinishdan keyin login bloklanadi", async () => {
    for (let i = 0; i < 10; i++) await call("/auth/login", { login: "906666661", password: `99${String(i).padStart(4, "0")}` });
    const r = await call<{ key: string }>("/auth/login", { login: "906666661", password: "246810" });
    assert.equal(r.status, 429);
    assert.equal(r.data.key, "err.loginBlocked");
  });
});

describe("o'quv markazi: lidlar", () => {
  it("administrator lid qo'shadi va o'quvchiga aylantiradi; boshqalar ko'rmaydi", async () => {
    const admin = await login("998908888888");
    const teacher = await login("998907777771");
    // Maktab administratorining eski sessiyasi parol testida bekor qilingan
    tokenCache.delete("998907777777");
    const schoolAdmin = await login("998907777777");
    const saved = await call<{ upsert: { leads: { id: string }[] } }>("/commands/lead.save", { name: "API Lid", phone: "90 765 43 21", interest: "SAT", source: "instagram" }, admin);
    assert.equal(saved.status, 200);
    const id = saved.data.upsert.leads[0].id;
    // O'qituvchi lid buyrug'ini bajara olmaydi va lidlarni ko'rmaydi
    assert.equal((await call("/commands/lead.update", { id, status: "contacted" }, teacher)).status, 403);
    const tv = await call<Database>("/bootstrap", undefined, teacher);
    assert.equal(tv.data.leads.length, 0);
    // Boshqa muassasa administratori ham ko'rmaydi
    const sv = await call<Database>("/bootstrap", undefined, schoolAdmin);
    assert.equal(sv.status, 200);
    assert.ok(!sv.data.leads.some((l) => l.id === id));
    const conv = await call<{ upsert: { students: { id: string; receiptId: string }[] } }>("/commands/lead.convert", { id, classId: "c_sat", adult: true }, admin);
    assert.equal(conv.status, 200);
    assert.match(conv.data.upsert.students[0].receiptId, /^\d{6}$/);
  });
});

describe("filial administratori va qarz eslatmasi", () => {
  it("parol bilan kiradi, faqat o'z filialini ko'radi, qarzdorlarga eslatadi", async () => {
    const r = await call<{ token: string }>("/auth/login", { login: "908888889", password: "246810" });
    assert.equal(r.status, 200);
    const tok = r.data.token;
    const db = await call<Database>("/bootstrap", undefined, tok);
    assert.deepEqual(db.data.classes.map((c) => c.id), ["c_sat"]);
    const deny = await call<{ key: string }>("/commands/student.save", { name: "X Y", classId: "c_ielts", parents: [] }, tok);
    assert.equal(deny.status, 403);
    assert.equal(deny.data.key, "err.branchForbidden");
    const rem = await call<{ upsert: { invoices: { studentId: string }[] } }>("/commands/payment.remind", {}, tok);
    assert.equal(rem.status, 200);
    const mine = new Set(db.data.students.map((s) => s.id));
    assert.ok(rem.data.upsert.invoices.every((i) => mine.has(i.studentId)));
  });
});

describe("sessiyalar", () => {
  it("chiqish, boshqa qurilmalardan chiqish, parol almashganda eski qurilmalar chiqadi", async () => {
    const loginAs = async () => (await call<{ token: string }>("/auth/login", { login: "903333333", password: "246810" })).data.token;
    const a = await loginAs();
    const b = await loginAs();
    const c = await loginAs();
    const list = await call<{ current: boolean }[]>("/auth/sessions", undefined, a);
    assert.ok(list.data.length >= 3);
    assert.equal(list.data.filter((s) => s.current).length, 1);
    // Chiqqan sessiya ishlamaydi
    assert.equal((await call("/auth/sign-out", {}, c)).status, 204);
    assert.equal((await call<{ key: string }>("/bootstrap", undefined, c)).data.key, "err.sessionExpired");
    // a: boshqa qurilmalardan chiqish → b ishlamaydi, a ishlaydi
    const r = await call<{ revoked: number }>("/auth/sessions/revoke-others", {}, a);
    assert.ok(r.data.revoked >= 1);
    assert.equal((await call("/bootstrap", undefined, b)).status, 401);
    assert.equal((await call("/bootstrap", undefined, a)).status, 200);
    // Soxta va imzosiz tokenlar
    assert.equal((await call("/bootstrap", undefined, a.slice(0, -2) + "xx")).status, 401);
  });
});

describe("bir kishi — bir nechta profil", () => {
  it("o'qituvchi kiradi va farzandining ota-ona profiliga o'tadi (eski sessiya yopiladi)", async () => {
    const l = await call<{ token: string; userId: string }>("/auth/login", { login: "903333333", password: "246810" });
    assert.equal(l.data.userId, "t_math");
    const list = await call<{ id: string; role: string; current: boolean }[]>("/auth/profiles", undefined, l.data.token);
    assert.deepEqual(list.data.map((p) => [p.id, p.role, p.current]), [["t_math", "teacher", true], ["u_tparent", "parent", false]]);
    // Begona profilga emas
    assert.equal((await call("/auth/profiles/switch", { userId: "u_parent" }, l.data.token)).status, 403);
    const sw = await call<{ token: string; userId: string }>("/auth/profiles/switch", { userId: "u_tparent" }, l.data.token);
    assert.equal(sw.status, 200, JSON.stringify(sw.data));
    assert.equal(sw.data.userId, "u_tparent");
    assert.equal((await call("/bootstrap", undefined, l.data.token)).status, 401);
    const boot = await call<Database>("/bootstrap", undefined, sw.data.token);
    assert.deepEqual(boot.data.students.map((x) => x.id), ["s_a2"]);
    assert.equal(boot.data.homeworks.every((h) => boot.data.classes.some((c) => c.id === h.classId && c.id === "c_5a")), true);
    const back = await call<{ userId: string }>("/auth/profiles/switch", { userId: "t_math" }, sw.data.token);
    assert.equal(back.data.userId, "t_math");
  });

  it("direktor ota-ona profiliga o'tadi, ota-ona profilidan direktorga o'tib bo'lmaydi", async () => {
    const admin = await login("998907777777");
    const add = await call("/commands/student.save", { name: "Direktor Farzandi", classId: "c_5a", parents: [{ name: "Nodira Yusupova", phone: "90 111 11 11" }] }, admin);
    assert.equal(add.status, 200, JSON.stringify(add.data));
    const d = await call<{ token: string; userId: string }>("/auth/login", { login: "901111111", password: "246810" });
    assert.equal(d.data.userId, "u_dir");
    const list = await call<{ id: string; role: string }[]>("/auth/profiles", undefined, d.data.token);
    const parent = list.data.find((p) => p.role === "parent")!;
    const sw = await call<{ token: string }>("/auth/profiles/switch", { userId: parent.id }, d.data.token);
    assert.equal(sw.status, 200);
    const back = await call<{ id: string }[]>("/auth/profiles", undefined, sw.data.token);
    assert.deepEqual(back.data.map((p) => p.id), [parent.id]);
    assert.equal((await call("/auth/profiles/switch", { userId: "u_dir" }, sw.data.token)).status, 403);
  });
});

describe("tezlik: katta ma'lumot", () => {
  it("yuz kesimi yozuvga emas, faylga; faqat o'quvchini ko'ra oladiganlarga", async () => {
    const t = (await call<{ token: string }>("/auth/login", { login: "903333333", password: "246810" })).data.token;
    const boot = await call<Database>("/bootstrap", undefined, t);
    const lesson = boot.data.lessons.find((l) => l.teacherId === "t_math" && l.classId === "c_7b")!;
    const day = addDays(new Date().toISOString().slice(0, 10), -2);
    const snap = "data:image/jpeg;base64," + Buffer.from("yuz-kesimi-rasm").toString("base64");
    const r = await call<Patch>("/commands/attendance.mark", { lessonId: lesson.id, day, marks: [{ studentId: "s_b0", status: "present", source: "face", snapshot: snap, score: 0.7 }] }, t);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const url = r.data.upsert!.attendance![0].snapshot!;
    assert.match(url, /\/files\/[0-9a-f]{32}$/);
    const id = /([0-9a-f]{32})$/.exec(url)![1];
    // Kamilaning ota-onasi ko'radi, boshqa ota-ona ko'rmaydi
    const parent = await login("998905555555");
    const signed = await call<Record<string, string>>("/files/sign", { ids: [id] }, parent);
    assert.ok(signed.data[id]);
    const img = await fetch(signed.data[id]);
    assert.equal(img.status, 200);
    assert.equal(Buffer.from(await img.arrayBuffer()).toString(), "yuz-kesimi-rasm");
    const strangerPhone = app.get(StoreService).db.users.find((u) => u.role === "parent" && u.childIds.includes("s_b3"))!.phone;
    const stranger = await login(strangerPhone);
    assert.deepEqual((await call<Record<string, string>>("/files/sign", { ids: [id] }, stranger)).data, {});
  });

  it("boshlang'ich yuklash: rahbariyatga davomat 35 kunlik, eskisi alohida; javob siqilgan", async () => {
    const store = app.get(StoreService);
    const old = addDays(new Date().toISOString().slice(0, 10), -60);
    const lesson = store.db.lessons.find((l) => l.classId === "c_7b")!;
    store.db.attendance.push({ id: "a_old_test", studentId: "s_b1", lessonId: lesson.id, day: old, status: "absent", source: "manual", markedAt: Date.now(), markedBy: "t_math" });
    const dir = await login("998901111111");
    const res = await fetch(base + "/bootstrap", { headers: { Authorization: `Bearer ${dir}`, "Accept-Encoding": "br, gzip" } });
    assert.equal(res.headers.get("content-encoding"), "br");
    const boot = (await res.json()) as Database;
    assert.ok(boot.attendanceFrom && boot.attendanceFrom > old);
    assert.ok(!boot.attendance.some((a) => a.id === "a_old_test"));
    const hist = await call<{ id: string }[]>(`/attendance?from=${old}&to=${addDays(boot.attendanceFrom!, -1)}`, undefined, dir);
    assert.ok(hist.data.some((a) => a.id === "a_old_test"));
    assert.equal((await call(`/attendance?from=x&to=${old}`, undefined, dir)).status, 400);
    // Ota-ona: o'z farzandi to'liq (oynasiz)
    const pboot = await call<Database>("/bootstrap", undefined, await login("998905555555"));
    assert.equal(pboot.data.attendanceFrom, undefined);
    // Ota-ona tarix so'rovida begona bolani (s_b1) ko'rmaydi
    const sh = await call<{ studentId: string }[]>(`/attendance?from=${old}&to=${old}`, undefined, await login("998905555555"));
    assert.equal(sh.status, 200);
    assert.ok(sh.data.every((a) => a.studentId === "s_a0" || a.studentId === "s_b0"));
  });

  it("yuz namunasi: tarmoqda ixcham (int8), serverda asl; namuna surati — fayl", async () => {
    const t = (await call<{ token: string }>("/auth/login", { login: "903333333", password: "246810" })).data.token;
    const tpl = Array.from({ length: 512 }, (_, i) => Math.sin(i) / 16);
    const photo = "data:image/jpeg;base64," + Buffer.from("namuna-surati").toString("base64");
    const r = await call<Patch & { upsert: { students: (Database["students"][number] & { faceQ?: string[] })[] } }>("/commands/face.enroll", { studentId: "s_b2", templates: [tpl, tpl], photo, model: "ghostfacenet-w1.3-s1" }, t);
    assert.equal(r.status, 200, JSON.stringify(r.data).slice(0, 200));
    const st = r.data.upsert.students[0];
    assert.equal(st.faceTemplates.length, 0);
    assert.equal(st.faceQ?.length, 2);
    // Serverda asl sonlar
    const mem = app.get(StoreService).db.students.find((x) => x.id === "s_b2")!;
    assert.equal(mem.faceTemplates[0].length, 512);
    assert.match(mem.facePhoto ?? "", /\/files\/[0-9a-f]{32}$/);
    const tb = await call<{ students: (Database["students"][number] & { faceQ?: string[] })[] }>("/bootstrap", undefined, t);
    assert.equal(tb.data.students.find((x) => x.id === "s_b2")!.faceQ?.length, 2);
    const db = await call<Database>("/bootstrap", undefined, await login("998901111111"));
    const ds = db.data.students.find((x) => x.id === "s_b2") as Database["students"][number] & { faceQ?: string[] };
    // Rahbariyat ham oladi (sozlamalardagi "o'xshash yuzlar" tekshiruvi, holat belgisi) — ixcham
    assert.deepEqual(ds.faceTemplates, []);
    assert.equal(ds.faceQ?.length, 2);
  });
});

describe("so'rov cheklovlari", () => {
  it("IP bo'yicha login, foydalanuvchi bo'yicha fayl hajmi (hisoblagich bazada)", async () => {
    const l = new LimitsService(sql, { rateLimitScale: 1 });
    const ip = `ip-${Date.now()}`;
    for (let i = 0; i < 30; i++) await l.loginAttempt(ip);
    await assert.rejects(() => l.loginAttempt(ip), (e: { key: string; status: number }) => e.key === "err.tooMany" && e.status === 429);
    await l.loginAttempt(`${ip}-boshqa`);
    const u = `u-${Date.now()}`;
    await l.upload(u, 49 * 1024 * 1024);
    await assert.rejects(() => l.upload(u, 2 * 1024 * 1024), (e: { key: string }) => e.key === "err.tooMany");
    await l.upload(`${u}-2`, 1024);
  });
});

describe("faoliyat jurnali", () => {
  it("direktor o'z muassasasi jurnalini ko'radi; maxfiy maydonlar yozilmaydi", async () => {
    const adm = (await call<{ token: string }>("/auth/login", { login: "908888888", password: "246810" })).data.token;
    await call("/auth/login", { login: "908888888", password: "000000" });
    const saved = await call<{ upsert: { leads: { id: string }[] } }>("/commands/lead.save", { name: "Jurnal Lid", phone: "90 765 00 11", interest: "IELTS", source: "telegram", note: "maxfiy izoh" }, adm);
    assert.equal(saved.status, 200);
    await new Promise((r) => setTimeout(r, 100));
    const dir = (await call<{ token: string }>("/auth/login", { login: "902222222", password: "246810" })).data.token;
    const log = await call<{ action: string; target?: string; details?: Record<string, unknown>; institutionId?: string; ip?: string }[]>("/audit?limit=100", undefined, dir);
    assert.equal(log.status, 200);
    assert.ok(log.data.every((e) => e.institutionId === "inst_center"));
    const lead = log.data.find((e) => e.action === "lead.save");
    assert.ok(lead && lead.target === saved.data.upsert.leads[0].id && lead.details?.name === "Jurnal Lid");
    assert.ok(log.data.some((e) => e.action === "auth.loginFailed"));
    assert.ok(log.data.some((e) => e.action === "auth.login"));
    assert.ok(log.data.every((e) => e.ip === undefined));
    // Administrator jurnalni o'qiy olmaydi
    assert.equal((await call("/audit", undefined, adm)).status, 403);
    // Yuz namunasi va rasm jurnalga tushmaydi
    const t = (await call<{ token: string }>("/auth/login", { login: "903333333", password: "246810" })).data.token;
    await call("/commands/face.enroll", { studentId: "s_b0", templates: [new Array(128).fill(0.1)], photo: "data:image/jpeg;base64,AAAA" }, t);
    const rows = await sql.query<{ details: unknown }>("SELECT details FROM audit_log WHERE action = 'face.enroll'");
    assert.ok(rows.every((r) => !JSON.stringify(r.details).includes("base64")));
  });
});

describe("production sozlamalari", () => {
  it("APP_ENV=production xavfli sozlama bilan ishga tushmaydi", () => {
    const good = { APP_ENV: "production", JWT_SECRET: "x".repeat(48), DATABASE_URL: "postgres://u:p@db/x", PUBLIC_URL: "https://api.example.uz", WEB_ORIGIN: "https://app.example.uz", SMS_DEV_MODE: "false", ESKIZ_EMAIL: "a@b.uz", AUTH_COOKIE: "true", MFA_KEY: Buffer.alloc(32, 7).toString("base64") } as NodeJS.ProcessEnv;
    assert.throws(() => loadConfig({ ...good, REQUIRE_STAFF_2FA: "false" }), /REQUIRE_STAFF_2FA/);
    assert.throws(() => loadConfig({ ...good, MFA_KEY: undefined }), /MFA_KEY/);
    assert.equal(loadConfig(good).requireStaff2fa, true);
    assert.throws(() => loadConfig({ ...good, AUTH_COOKIE: "false" }), /AUTH_COOKIE/);
    assert.doesNotThrow(() => loadConfig(good));
    assert.throws(() => loadConfig({ ...good, SEED_DEMO: "true" }), /SEED_DEMO/);
    assert.throws(() => loadConfig({ ...good, SMS_DEV_MODE: "true" }), /SMS_DEV_MODE/);
    assert.throws(() => loadConfig({ ...good, WEB_ORIGIN: "http://app.example.uz" }), /WEB_ORIGIN/);
    assert.throws(() => loadConfig({ ...good, DATABASE_URL: "pglite:./data" }), /DATABASE_URL/);
  });
});

describe("faoliyat jurnali tartibi", () => {
  it("eng yangisi birinchi, sahifalash takrorsiz", async () => {
    const dir = (await call<{ token: string }>("/auth/login", { login: "902222222", password: "246810" })).data.token;
    const all = (await call<{ id: string; at: number }[]>("/audit?limit=200", undefined, dir)).data;
    assert.ok(all.length > 12);
    for (let i = 1; i < all.length; i++) assert.ok(Number(all[i - 1].id) > Number(all[i].id));
    const p1 = (await call<{ id: string }[]>("/audit?limit=5", undefined, dir)).data;
    const p2 = (await call<{ id: string }[]>(`/audit?limit=5&before=${p1[4].id}`, undefined, dir)).data;
    assert.deepEqual([...p1, ...p2].map((e) => e.id), all.slice(0, 10).map((e) => e.id));
  });
});

describe("qisqa muddatli token va refresh", () => {
  it("refresh token almashadi; eskisi qayta ishlatilsa sessiya bekor bo'ladi", async () => {
    const r = await call<{ token: string; refreshToken: string; expiresIn: number }>("/auth/login", { login: "kamila.karimova", password: "246810" });
    assert.equal(r.data.expiresIn, 900);
    assert.ok(r.data.refreshToken);
    const r2 = await call<{ token: string; refreshToken: string }>("/auth/refresh", { refreshToken: r.data.refreshToken });
    assert.equal(r2.status, 200);
    assert.notEqual(r2.data.refreshToken, r.data.refreshToken);
    assert.equal((await call("/bootstrap", undefined, r2.data.token)).status, 200);
    // Hozirgina almashgan eski token: "poyga" (boshqa oyna), sessiya saqlanadi
    assert.equal((await call("/auth/refresh", { refreshToken: r.data.refreshToken })).status, 409);
    // Soxta token
    assert.equal((await call("/auth/refresh", { refreshToken: `${r.data.refreshToken.split(".")[0]}.soxta` })).status, 401);
    // Soxta urinish sessiyani bekor qildi (o'g'irlik belgisi)
    assert.equal((await call("/auth/refresh", { refreshToken: r2.data.refreshToken })).status, 401);
    assert.equal((await call("/bootstrap", undefined, r2.data.token)).status, 401);
  });

  it("muddati tugagan token: err.tokenExpired; JSON bo'lmagan refresh so'rovi rad etiladi", async () => {
    const jwt = await import("jsonwebtoken");
    const expired = jwt.default.sign({ sub: "t_math", v: 0, sid: "x", exp: Math.floor(Date.now() / 1000) - 10 }, loadConfig({} as NodeJS.ProcessEnv).jwtSecret, { algorithm: "HS256", issuer: "edunazorat" });
    assert.equal((await call<{ key: string }>("/bootstrap", undefined, expired)).data.key, "err.tokenExpired");
    const res = await fetch(`${base}/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "refreshToken=x" });
    assert.equal(res.status, 403);
  });
});

describe("cookie rejimi (AUTH_COOKIE)", () => {
  it("refresh token faqat httpOnly cookie'da, javobda yo'q", async () => {
    const config = { ...loadConfig({ SEED_DEMO: "true", SMS_DEV_MODE: "true", DATABASE_URL: "pglite:memory", AUTH_COOKIE: "true", RATE_LIMIT_SCALE: "100", PUBLIC_URL: "https://api.example.uz" } as NodeJS.ProcessEnv), port: 0 };
    const db2 = await connect(config.databaseUrl);
    const app2 = await createApp(config, db2, ["error"]);
    await app2.listen(0, "127.0.0.1");
    const b2 = `http://127.0.0.1:${(app2.getHttpServer().address() as { port: number }).port}`;
    try {
      const res = await fetch(`${b2}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login: "903333333", password: "246810" }) });
      const body = await res.json() as { token: string; refreshToken?: string };
      assert.equal(body.refreshToken, undefined);
      const cookie = res.headers.get("set-cookie") ?? "";
      assert.match(cookie, /edn_rt=/);
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /SameSite=Strict/i);
      assert.match(cookie, /Secure/i);
      assert.match(cookie, /Path=\/auth/i);
      const rt = /edn_rt=([^;]+)/.exec(cookie)![1];
      const ref = await fetch(`${b2}/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: `edn_rt=${rt}` }, body: "{}" });
      assert.equal(ref.status, 200);
      assert.match(ref.headers.get("set-cookie") ?? "", /edn_rt=/);
      // Body'dagi refresh token cookie rejimida qabul qilinmaydi
      const viaBody = await fetch(`${b2}/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: decodeURIComponent(rt) }) });
      assert.equal(viaBody.status, 401);
    } finally {
      await app2.close();
      await db2.close();
    }
  });
});

describe("ikki bosqichli kirish (2FA)", () => {
  const codeNow = async (secret: string, offset = 0) => totpCode(secret, totpStep(Date.now()) + offset);

  it("yoqish, parol + kod bilan kirish, kodni qayta ishlatib bo'lmaydi, zaxira kod bir marta", async () => {
    const dir = (await call<{ token: string }>("/auth/login", { login: "901111111", password: "246810" })).data.token;
    assert.deepEqual((await call<{ enabled: boolean }>("/auth/mfa/status", undefined, dir)).data, { enabled: false, required: false });
    const setup = await call<{ secret: string; url: string }>("/auth/mfa/setup", {}, dir);
    assert.match(setup.data.url, /^otpauth:\/\/totp\/EduNazorat/);
    assert.equal((await call("/auth/mfa/enable", { code: "000000" }, dir)).status, 400);
    const en = await call<{ backupCodes: string[] }>("/auth/mfa/enable", { code: await codeNow(setup.data.secret) }, dir);
    assert.equal(en.data.backupCodes.length, 10);

    // Endi parol yetarli emas
    const step1 = await call<{ mfaRequired?: boolean; mfaToken?: string; token?: string }>("/auth/login", { login: "901111111", password: "246810" });
    assert.equal(step1.data.mfaRequired, true);
    assert.equal(step1.data.token, undefined);
    // Oraliq token kirish tokeni o'rnida ishlamaydi
    assert.equal((await call("/bootstrap", undefined, step1.data.mfaToken)).status, 401);
    assert.equal((await call("/auth/mfa/verify", { mfaToken: step1.data.mfaToken, code: "123456" })).status, 401);
    // Yoqishda ishlatilgan kod qayta ishlamaydi; keyingi qadam kodi ishlaydi
    const next = await codeNow(setup.data.secret, 1);
    const ok = await call<{ token: string }>("/auth/mfa/verify", { mfaToken: step1.data.mfaToken, code: next });
    assert.equal(ok.status, 200);
    assert.equal((await call("/bootstrap", undefined, ok.data.token)).status, 200);
    const again = await call<{ mfaToken: string }>("/auth/login", { login: "901111111", password: "246810" });
    assert.equal((await call("/auth/mfa/verify", { mfaToken: again.data.mfaToken, code: next })).status, 401);
    // Zaxira kod (katta harf va probel bilan ham) bir marta
    const backup = en.data.backupCodes[0].toUpperCase().replace("-", " ");
    assert.equal((await call("/auth/mfa/verify", { mfaToken: again.data.mfaToken, code: backup })).status, 200);
    const third = await call<{ mfaToken: string }>("/auth/login", { login: "901111111", password: "246810" });
    assert.equal((await call("/auth/mfa/verify", { mfaToken: third.data.mfaToken, code: backup })).status, 401);
    // Kalit bazada ochiq holda saqlanmaydi
    const [row] = await sql.query<{ secret_enc: string; backup: unknown }>("SELECT secret_enc, backup FROM mfa WHERE user_id = 'u_dir'");
    assert.ok(!row.secret_enc.includes(setup.data.secret));
    assert.ok(!JSON.stringify(row.backup).includes(en.data.backupCodes[1]));
  });

  it("majburiy rejim: rahbariyat 2FA yoqmaguncha faqat sozlash; parol tiklansa 2FA qayta sozlanadi", async () => {
    const config = { ...loadConfig({ SEED_DEMO: "true", SMS_DEV_MODE: "true", DATABASE_URL: "pglite:memory", REQUIRE_STAFF_2FA: "true", RATE_LIMIT_SCALE: "100" } as NodeJS.ProcessEnv), port: 0 };
    const db2 = await connect(config.databaseUrl);
    const app2 = await createApp(config, db2, ["error"]);
    await app2.listen(0, "127.0.0.1");
    const b2 = `http://127.0.0.1:${(app2.getHttpServer().address() as { port: number }).port}`;
    const c2 = async <T>(path: string, body?: unknown, token?: string) => {
      const r = await fetch(b2 + path, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: r.status, data: (await r.json().catch(() => null)) as T };
    };
    try {
      const adm = await c2<{ token: string; mfaSetupRequired: boolean }>("/auth/login", { login: "907777777", password: "246810" });
      assert.equal(adm.data.mfaSetupRequired, true);
      const blocked = await c2<{ key: string }>("/bootstrap", undefined, adm.data.token);
      assert.equal(blocked.status, 403);
      assert.equal(blocked.data.key, "err.mfaSetupRequired");
      const s = await c2<{ secret: string }>("/auth/mfa/setup", {}, adm.data.token);
      await c2("/auth/mfa/enable", { code: await codeNow(s.data.secret) }, adm.data.token);
      assert.equal((await c2("/bootstrap", undefined, adm.data.token)).status, 200);
      assert.equal((await c2<{ key: string }>("/auth/mfa/disable", { code: await codeNow(s.data.secret, 1) }, adm.data.token)).data.key, "err.mfaRequired");
      // Ota-onaga majburiy emas
      const par = await c2<{ token: string; mfaSetupRequired: boolean }>("/auth/login", { login: "905555555", password: "246810" });
      assert.equal(par.data.mfaSetupRequired, false);
      assert.equal((await c2("/bootstrap", undefined, par.data.token)).status, 200);
      // Direktor administrator parolini tiklaydi → 2FA o'chadi (telefon yo'qolgan holat)
      const d = await c2<{ token: string }>("/auth/login", { login: "901111111", password: "246810" });
      const ds = await c2<{ secret: string }>("/auth/mfa/setup", {}, d.data.token);
      await c2("/auth/mfa/enable", { code: await codeNow(ds.data.secret) }, d.data.token);
      const r = await c2<{ password: string }>("/auth/password/reset", { userId: "u_adm" }, d.data.token);
      assert.equal(r.status, 200);
      const again = await c2<{ mfaRequired?: boolean; mfaSetupRequired?: boolean }>("/auth/login", { login: "907777777", password: r.data.password });
      assert.equal(again.data.mfaRequired, undefined);
      assert.equal(again.data.mfaSetupRequired, true);
    } finally {
      await app2.close();
      await db2.close();
    }
  });
});
