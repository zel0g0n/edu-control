import { describe, expect, it } from "vitest";
import {
  arrivalStatus, attendanceRate, billingTotals, clickPaymentUrl, findConflicts, invoicesToCreate, normalizePhone,
  assignMissingReceiptIds, buildInvoices, canManageCredentials, classIdsOf, lessonCount, tuitionFor, executeCommand, inClass, notifyTargets, translate, updateEnrollments, formatReceiptId, generatePassword, invoiceForAccount, isWeakPin, makeStudentLogin, parseReceiptId,
  applyPatch, registerRussian, RU, packDatabase, unpackDatabase, packTemplate, unpackTemplate, findLoginCandidates, findLoginUser, linkedProfiles, phoneProfiles, base32Decode, base32Encode, checkNewPassword, newBackupCodes, totpCode, totpStep, verifyTotp, holidayDays, holidayOn, payrollFor, paymePaymentUrl, scopeDatabase, scopePatch, seedDatabase, suggestTermGrade, summarizeDay, weightedAverage, type AttendanceRecord, type Grade, type Lesson, type Student,
} from "./index";

registerRussian(RU);

const NOW = new Date(2026, 9, 8, 10, 0).getTime(); // payshanba
const L = (id: string, start: string, end: string, extra: Partial<Lesson> = {}): Lesson =>
  ({ id, classId: "c", subject: "M", teacherId: "t", weekday: 4, start, end, room: "1", ...extra });
const R = (lessonId: string, status: AttendanceRecord["status"], markedAt = 0, snapshot?: string): AttendanceRecord =>
  ({ id: lessonId + status, studentId: "s", lessonId, day: "2026-10-08", status, source: snapshot ? "face" : "manual", markedAt, markedBy: "t", snapshot });

describe("davomat", () => {
  it("kechikish chegarasi", () => {
    const l = L("a", "08:30", "09:15");
    expect(arrivalStatus(l, "2026-10-08", new Date(2026, 9, 8, 8, 39).getTime(), 10)).toBe("present");
    expect(arrivalStatus(l, "2026-10-08", new Date(2026, 9, 8, 8, 41).getTime(), 10)).toBe("late");
  });
  it("kunlik xulosa dars yozuvlaridan", () => {
    const ls = [L("a", "08:30", "09:15"), L("b", "09:25", "10:10"), L("c", "10:20", "11:05")];
    const s = summarizeDay([R("c", "absent"), R("a", "late", 5, "img"), R("b", "present", 9)], ls);
    expect(s.status).toBe("late");
    expect(s.arrivedAt).toBe(5);
    expect(s.snapshot).toBe("img");
    expect([s.presentLessons, s.absentLessons]).toEqual([2, 1]);
    expect(summarizeDay([R("a", "excused"), R("b", "excused")], ls).status).toBe("excused");
    expect(summarizeDay([R("a", "excused"), R("b", "absent")], ls).status).toBe("absent");
    expect(summarizeDay([], ls).status).toBeNull();
    expect(attendanceRate([R("a", "present"), R("b", "absent")])).toBe(0.5);
  });
});

describe("baholar", () => {
  const G = (value: number, type: Grade["type"]): Grade => ({ id: "x", studentId: "s", subject: "M", value, type, day: "d", createdAt: 0, teacherId: "t" });
  it("nazorat ishi ikki baravar", () => {
    expect(weightedAverage([G(5, "current"), G(2, "control")])).toBe(3);
    expect(weightedAverage([G(5, "term")])).toBeNull();
  });
  it("chorak bahosi taklifi", () => {
    expect(suggestTermGrade(4.5)).toBe(5);
    expect(suggestTermGrade(4.49)).toBe(4);
    expect(suggestTermGrade(1.2)).toBe(2);
  });
});

describe("jadval", () => {
  const ls = [L("a", "08:30", "09:15"), L("b", "09:25", "10:10", { classId: "d", teacherId: "t2", room: "5" })];
  it("to'qnashuvlar", () => {
    expect(findConflicts({ ...L("x", "09:00", "09:40"), classId: "z", teacherId: "t" }, ls).map((c) => c.kind)).toEqual(["teacher"]);
    expect(findConflicts({ ...L("x", "09:20", "09:40"), classId: "c", teacherId: "q" }, ls)).toHaveLength(0);
    expect(findConflicts({ ...L("x", "09:30", "09:40"), classId: "q", teacherId: "q", room: "5" }, ls).map((c) => c.kind)).toEqual(["room"]);
    expect(findConflicts({ ...ls[0] }, ls)).toHaveLength(0);
  });
});

describe("to'lovlar", () => {
  it("oy uchun hisob-varaqlar", () => {
    const students = [
      { id: "s1", classId: "c1", archived: false }, { id: "s2", classId: "c1", archived: true }, { id: "s3", classId: "c2", archived: false },
    ] as never;
    const classes = [{ id: "c1", monthlyFee: 100 }, { id: "c2", monthlyFee: 0 }] as never;
    const out = invoicesToCreate("2026-02", students, classes, [], 30);
    expect(out).toEqual([{ studentId: "s1", month: "2026-02", amount: 100, dueDay: "2026-02-28", payments: [] }]);
  });
  it("Click va Payme havolalari", () => {
    expect(clickPaymentUrl({}, "inv1", 1000)).toBeNull();
    expect(clickPaymentUrl({ clickServiceId: "1", clickMerchantId: "2" }, "inv1", 1000)).toBe(
      "https://my.click.uz/services/pay?service_id=1&merchant_id=2&amount=1000&transaction_param=inv1",
    );
    const url = paymePaymentUrl({ paymeMerchantId: "abc" }, "inv1", 1000)!;
    expect(Buffer.from(url.split("/").pop()!, "base64").toString()).toBe("m=abc;ac.order_id=inv1;a=100000");
  });
  it("jami", () => {
    expect(billingTotals([{ id: "i", studentId: "s", month: "m", amount: 100, dueDay: "d", payments: [{ id: "p", amount: 40, date: 0, method: "cash", recordedBy: "u" }] }]))
      .toEqual({ total: 100, paid: 40, remaining: 60, debtors: 1 });
  });
});

describe("demo baza", () => {
  const db = seedDatabase(NOW);
  it("izchil", () => {
    const ids = new Set(db.lessons.map((l) => l.id));
    expect(db.attendance.every((a) => ids.has(a.lessonId))).toBe(true);
    const sids = new Set(db.students.map((s) => s.id));
    expect(db.grades.every((g) => sids.has(g.studentId))).toBe(true);
    expect(db.users.find((u) => u.phone === "998904444444")?.studentId).toBe("s_b0");
    // Bir telefon — bir muassasada bir rolda bitta profil (o'qituvchi + ota-ona bo'lishi mumkin)
    const keys = db.users.filter((u) => u.phone).map((u) => `${u.phone}|${u.role}|${u.institutionId ?? ""}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(seedDatabase(NOW)).toEqual(db);
  });
  it("telefon raqam", () => {
    expect(normalizePhone("90 123 45 67")).toBe("998901234567");
    expect(normalizePhone("+998 90 123 45 67")).toBe("998901234567");
    expect(normalizePhone("123")).toBeNull();
  });
});

describe("ko'rinish qoidalari (scope)", () => {
  const db = seedDatabase(new Date(2026, 9, 8, 10, 0).getTime());
  const user = (id: string) => db.users.find((u) => u.id === id)!;

  it("ota-ona faqat o'z farzandlarini ko'radi, yuz namunasiz", () => {
    const v = scopeDatabase(db, user("u_parent"));
    expect(v.students.map((s) => s.id).sort()).toEqual(["s_a0", "s_b0"]);
    expect(v.students.every((s) => s.faceTemplates.length === 0)).toBe(true);
    expect(v.attendance.every((a) => a.studentId === "s_a0" || a.studentId === "s_b0")).toBe(true);
    expect(v.notifications.every((n) => n.userId === "u_parent")).toBe(true);
    // O'qituvchi telefoni ko'rinmaydi
    expect(v.users.filter((u) => u.role === "teacher").every((u) => u.phone === "")).toBe(true);
    expect(v.users.some((u) => u.role === "director")).toBe(false);
  });

  it("o'quvchi to'lovlarni ko'rmaydi", () => {
    const v = scopeDatabase(db, user("u_student"));
    expect(v.students.map((s) => s.id)).toEqual(["s_b0"]);
    expect(v.invoices).toHaveLength(0);
    expect(v.threads).toHaveLength(0);
  });

  it("o'qituvchi faqat o'z sinflarini, direktor yozishmalarni ko'rmaydi", () => {
    const t = scopeDatabase(db, user("t_math"));
    const classes = new Set(db.lessons.filter((l) => l.teacherId === "t_math").map((l) => l.classId));
    expect(t.students.every((s) => classes.has(s.classId))).toBe(true);
    expect(t.invoices).toHaveLength(0);
    const d = scopeDatabase(db, user("u_dir"));
    expect(d.threads).toHaveLength(0);
    expect(d.students.every((s) => s.institutionId === "inst_school")).toBe(true);
  });

  it("patch filtrlash: boshqa ota-onaning bildirishnomasi yetib bormaydi", () => {
    const p = scopePatch(db, user("u_parent"), { upsert: { notifications: [
      { id: "x1", userId: "u_parent", type: "grade", key: "k", params: {}, time: 1, read: false },
      { id: "x2", userId: "someone", type: "grade", key: "k", params: {}, time: 1, read: false },
    ] } });
    expect(p.upsert?.notifications?.map((n) => n.id)).toEqual(["x1"]);
  });
});

describe("Kvitansiya ID", () => {
  it("demo ma'lumotda hammada bor, noyob va har safar bir xil", () => {
    const a = seedDatabase(NOW), b = seedDatabase(NOW);
    const ids = a.students.map((s) => s.receiptId);
    expect(ids.every((x) => /^[1-9]\d{5}$/.test(x ?? ""))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(b.students.map((s) => s.receiptId)).toEqual(ids);
  });

  it("kiritishdagi bo'shliq va belgilarni tushunadi", () => {
    expect(parseReceiptId("104 523")).toBe("104523");
    expect(parseReceiptId("№104523")).toBe("104523");
    expect(parseReceiptId("012345")).toBeNull();
    expect(parseReceiptId("12345")).toBeNull();
    expect(formatReceiptId("104523")).toBe("104 523");
  });

  it("eski o'quvchilarga beriladi, borlariga tegilmaydi", () => {
    const db = seedDatabase(NOW);
    const keep = db.students[0].receiptId;
    db.students[1] = { ...db.students[1], receiptId: undefined };
    const changed = assignMissingReceiptIds(db);
    expect(changed.map((s) => s.id)).toEqual([db.students[1].id]);
    expect(changed[0].receiptId).not.toBe(keep);
    expect(assignMissingReceiptIds({ students: db.students.map((s) => changed.find((c) => c.id === s.id) ?? s) })).toEqual([]);
  });

  it("yangi o'quvchiga beriladi, tahrirlashda o'zgarmaydi", () => {
    const db = seedDatabase(NOW);
    const dir = db.users.find((u) => u.role === "admin" && u.institutionId === "inst_school")!;
    const cls = db.classes.find((c) => c.institutionId === "inst_school")!;
    const add = executeCommand(db, dir, "student.save", { name: "Yangi O'quvchi", classId: cls.id, parents: [] }, NOW);
    const s = add.upsert!.students![0];
    expect(s.receiptId).toMatch(/^[1-9]\d{5}$/);
    expect(db.students.some((x) => x.receiptId === s.receiptId)).toBe(false);
    const prev = db.students.find((x) => x.institutionId === "inst_school")!;
    const edit = executeCommand(db, dir, "student.save", { id: prev.id, name: prev.name + " (t)", classId: prev.classId, parents: [] }, NOW);
    expect(edit.upsert!.students![0].receiptId).toBe(prev.receiptId);
    expect(edit.upsert!.students![0].faceModel).toBe(prev.faceModel);
  });

  it("to'lovda: hisob-varaq ID yoki Kvitansiya ID (eng eski qarz)", () => {
    const db = seedDatabase(NOW);
    const inv = db.invoices.find((i) => i.payments.length === 0)!;
    expect(invoiceForAccount(db, inv.id)?.id).toBe(inv.id);
    const s = db.students.find((x) => x.id === inv.studentId)!;
    const got = invoiceForAccount(db, s.receiptId!)!;
    expect(got.studentId).toBe(s.id);
    expect(got.payments.reduce((a, p) => a + p.amount, 0)).toBeLessThan(got.amount);
    expect(invoiceForAccount(db, "999999")).toBeUndefined();
  });
});

describe("kirish ma'lumotlari", () => {
  it("login ism.familiya: o'zbekcha belgilar va kirill, band bo'lsa raqam", () => {
    const used = new Set<string>();
    expect(makeStudentLogin("Aziz Karimov", used)).toBe("aziz.karimov");
    expect(makeStudentLogin("Oʻgʻiloy Xo'jayeva", used)).toBe("ogiloy.xojayeva");
    expect(makeStudentLogin("Шахзода Ғаниева", used)).toBe("shaxzoda.ganieva");
    used.add("aziz.karimov");
    expect(makeStudentLogin("aziz  karimov", used)).toBe("aziz.karimov2");
  });

  it("oson parollar rad etiladi, yaratilgani 6 raqam", () => {
    for (const p of ["111111", "123456", "654321", "000000"]) expect(isWeakPin(p)).toBe(true);
    expect(isWeakPin("482917")).toBe(false);
    for (let i = 0; i < 50; i++) {
      const p = generatePassword();
      expect(p).toMatch(/^\d{6}$/);
      expect(isWeakPin(p)).toBe(false);
    }
  });

  it("kim kimga parol bera oladi", () => {
    const db = seedDatabase(NOW);
    const u = (id: string) => db.users.find((x) => x.id === id)!;
    const center = db.users.find((x) => x.role === "teacher" && x.institutionId === "inst_center");
    expect(canManageCredentials(u("u_adm"), u("t_math"), db)).toBe(true);
    expect(canManageCredentials(u("u_adm"), u("u_parent"), db)).toBe(true);
    expect(canManageCredentials(u("u_adm"), u("u_dir"), db)).toBe(false);
    expect(canManageCredentials(u("u_adm2"), u("t_math"), db)).toBe(false);
    if (center) expect(canManageCredentials(u("u_adm"), center, db)).toBe(false);
    expect(canManageCredentials(u("u_dir"), u("u_adm"), db)).toBe(true);
    expect(canManageCredentials(u("u_dir"), u("t_math"), db)).toBe(false);
    expect(canManageCredentials(u("u_dir2"), u("u_adm"), db)).toBe(false);
    expect(canManageCredentials(u("u_super"), u("u_dir"), db)).toBe(true);
    expect(canManageCredentials(u("t_math"), u("u_parent"), db)).toBe(false);
  });

  it("har o'quvchining login bilan akkaunti bor", () => {
    const db = seedDatabase(NOW);
    for (const s of db.students) {
      const acc = db.users.find((x) => x.id === s.userId);
      expect(acc).toMatchObject({ role: "student", studentId: s.id });
      expect(acc!.login).toMatch(/^[a-z]+\.[a-z]+\d*$/);
    }
    expect(new Set(db.users.map((x) => x.login).filter(Boolean)).size).toBe(db.users.filter((x) => x.login).length);
  });
});

describe("o'quv markazi: guruhlar", () => {
  it("bir nechta guruh: a'zolik, jadval va to'lov yig'indisi", () => {
    const db = seedDatabase(NOW);
    const s = db.students.find((x) => x.id === "s_c0")!;
    expect(classIdsOf(s)).toEqual(["c_ielts", "c_sat"]);
    expect(inClass(s, "c_sat")).toBe(true);
    // 2027-yil yanvar: SAT (Se/Pa) 8 dars × 140 000 darsbay, IELTS oylik 900 000
    const out = buildInvoices("2027-01", db.students.filter((x) => x.institutionId === "inst_center"), [], 5, { classes: db.classes, lessons: db.lessons, attendance: db.attendance });
    expect(out.find((i) => i.studentId === "s_c0")!.amount).toBe(900_000 + 8 * 140_000);
    expect(out.find((i) => i.studentId === "s_c1")!.amount).toBe(900_000);
  });

  it("guruhga qo'shilish va chiqish tarixi", () => {
    const a = updateEnrollments(undefined, ["g1"], ["g1", "g2"], "2026-10-01");
    expect(a).toEqual([{ classId: "g1", from: "" }, { classId: "g2", from: "2026-10-01" }]);
    const b = updateEnrollments(a, ["g1", "g2"], ["g2"], "2026-11-01");
    expect(b).toEqual([{ classId: "g1", from: "", to: "2026-11-01" }, { classId: "g2", from: "2026-10-01" }]);
    // Qaytib kelsa yangi yozuv
    expect(updateEnrollments(b, ["g2"], ["g2", "g1"], "2026-12-01").filter((e) => e.classId === "g1")).toHaveLength(2);
  });

  it("administrator: qo'shimcha guruh, katta yoshli; maktabda qo'shimcha guruh yo'q", () => {
    const db = seedDatabase(NOW);
    const adm2 = db.users.find((u) => u.id === "u_adm2")!;
    const p = executeCommand(db, adm2, "student.save", { name: "Kattalar Kursi", classId: "c_ielts", extraClassIds: ["c_sat", "c_ielts"], adult: true, parents: [{ name: "X", phone: "93 111 22 33" }] }, NOW);
    const s = p.upsert!.students![0];
    expect(s).toMatchObject({ classId: "c_ielts", extraClassIds: ["c_sat"], adult: true, parentIds: [] });
    expect(s.enrollments!.map((e) => e.classId)).toEqual(["c_ielts", "c_sat"]);
    // Boshqa muassasa guruhi qo'shilmaydi
    expect(() => executeCommand(db, adm2, "student.save", { name: "Y", classId: "c_ielts", extraClassIds: ["c_5a"], parents: [] }, NOW)).toThrow();
    // Maktabda qo'shimcha guruh e'tiborsiz
    const adm = db.users.find((u) => u.id === "u_adm")!;
    const q = executeCommand(db, adm, "student.save", { name: "Z", classId: "c_5a", extraClassIds: ["c_7b"], adult: true, parents: [] }, NOW);
    expect(q.upsert!.students![0]).toMatchObject({ classId: "c_5a", extraClassIds: undefined, adult: undefined });
  });

  it("katta yoshli o'quvchiga davomat xabari o'ziga boradi", () => {
    const db = seedDatabase(NOW);
    const s = db.students.find((x) => x.id === "s_d3")!;
    expect(notifyTargets(s)).toEqual([s.userId]);
    const lesson = db.lessons.find((l) => l.classId === "c_sat")!;
    const teacher = db.users.find((u) => u.id === lesson.teacherId)!;
    const p = executeCommand(db, teacher, "attendance.mark", { lessonId: lesson.id, day: "2026-10-06", marks: [{ studentId: "s_d3", status: "late", source: "manual" }] }, NOW);
    expect(p.upsert!.notifications!.map((n) => n.userId)).toEqual([s.userId]);
  });

  it("baho tizimi o'chirilsa baho qo'yilmaydi", () => {
    const db = seedDatabase(NOW);
    db.institutions.find((i) => i.id === "inst_center")!.settings.gradesEnabled = false;
    const t = db.users.find((u) => u.id === "t_ielts")!;
    expect(() => executeCommand(db, t, "grade.add", { studentId: "s_c0", subject: "IELTS", value: 5, type: "current", day: "2026-10-06" }, NOW)).toThrow("err.gradesDisabled");
  });

  it("atamalar: o'quv markazida sinf → guruh", () => {
    expect(translate("uz", "Sinflar va jurnal", undefined, "center")).toBe("Guruhlar va jurnal");
    expect(translate("uz", "Sinfda o'quvchi yo'q", undefined, "center")).toBe("Guruhda o'quvchi yo'q");
    expect(translate("uz", "Sinf rahbari", undefined, "center")).toBe("Mas'ul o'qituvchi");
    expect(translate("ru", "Sinf o'chirildi", undefined, "center")).toBe("Группа удалена");
    expect(translate("ru", "Sinf o'chirildi")).toBe("Класс удалён");
    expect(translate("uz", "Sinflar")).toBe("Sinflar");
  });
});

describe("o'quv markazi: to'lov hisobi", () => {
  // 2026-11: 30 kun; Du/Cho/Ju = 13 kun, Se/Pa = 8 kun
  const L = (id: string, classId: string, weekday: number): Lesson => ({ id, classId, subject: "X", teacherId: "t", weekday, start: "17:00", end: "18:30", room: "1" });
  const lessons = [L("a1", "g_m", 1), L("a3", "g_m", 3), L("a5", "g_m", 5), L("b2", "g_p", 2), L("b4", "g_p", 4)];
  const monthly = { id: "g_m", institutionId: "i", name: "M", monthlyFee: 1_300_000, absenceRefund: "excused" as const };
  const perLesson = { id: "g_p", institutionId: "i", name: "P", monthlyFee: 0, billingMode: "perLesson" as const, lessonPrice: 150_000, absenceRefund: "all" as const };
  const course = { id: "g_c", institutionId: "i", name: "C", monthlyFee: 0, billingMode: "course" as const, coursePrice: 2_000_000 };
  const classes = [monthly, perLesson, course];
  const st = (extra: Partial<Student> = {}): Student => ({ id: "s", institutionId: "i", name: "S", classId: "g_m", parentIds: [], archived: false, parentConsent: false, faceTemplates: [], ...extra });

  it("darslar soni jadvaldan", () => {
    expect(lessonCount(lessons, "g_m", Array.from({ length: 30 }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`))).toBe(13);
  });

  it("oylik: to'liq oy = narx; oy o'rtasida qo'shilsa dars soniga qarab", () => {
    expect(tuitionFor(st(), "2026-11", { classes, lessons, attendance: [] }).amount).toBe(1_300_000);
    // 1-noyabr 2026 yakshanba. 16..30 da Du/Cho/Ju = 7 dars (13 dan)
    const mid = st({ enrollments: [{ classId: "g_m", from: "2026-11-16" }] });
    const t = tuitionFor(mid, "2026-11", { classes, lessons, attendance: [] });
    expect(t.amount).toBe(700_000);
    expect(t.lines[0]).toMatchObject({ partial: true, lessons: 7 });
    // Oktabrda hali yo'q edi
    expect(tuitionFor(mid, "2026-10", { classes, lessons, attendance: [] }).amount).toBe(0);
  });

  it("darsbay: narx × darslar; ikki guruh yig'indisi", () => {
    const s = st({ extraClassIds: ["g_p"] });
    const t = tuitionFor(s, "2026-11", { classes, lessons, attendance: [] });
    expect(t.lines.map((l) => [l.classId, l.amount])).toEqual([["g_m", 1_300_000], ["g_p", 8 * 150_000]]);
    expect(t.amount).toBe(2_500_000);
  });

  it("qoldirilgan darslar keyingi oyda chegiriladi (sozlamaga qarab)", () => {
    const s = st({ extraClassIds: ["g_p"] });
    const a = (lessonId: string, day: string, status: AttendanceRecord["status"]): AttendanceRecord =>
      ({ id: lessonId + day, studentId: "s", lessonId, day, status, source: "manual", markedAt: 0, markedBy: "t" });
    const attendance = [
      a("a1", "2026-10-05", "excused"), // oylik guruh, sababli: chegiriladi
      a("a3", "2026-10-07", "absent"), // oylik guruh, sababsiz: chegirilmaydi ("excused" sozlamasi)
      a("b2", "2026-10-06", "absent"), // darsbay guruh, "all": chegiriladi
      a("b4", "2026-11-05", "absent"), // shu oy: keyingi oyda hisoblanadi
    ];
    const t = tuitionFor(s, "2026-11", { classes, lessons, attendance });
    const refunds = t.lines.filter((l) => l.kind === "absenceRefund");
    // Oktyabr 2026: Du 4 + Cho 4 + Ju 5 = 13 dars → 1 300 000 / 13 = 100 000
    expect(refunds).toEqual([
      { kind: "absenceRefund", classId: "g_m", amount: -100_000, lessons: 1 },
      { kind: "absenceRefund", classId: "g_p", amount: -150_000, lessons: 1 },
    ]);
    expect(t.amount).toBe(2_500_000 - 100_000 - 150_000);
  });

  it("kurs: qo'shilgan oyda bir marta", () => {
    const s = st({ classId: "g_c", enrollments: [{ classId: "g_c", from: "2026-11-03" }] });
    expect(tuitionFor(s, "2026-11", { classes, lessons, attendance: [] }).amount).toBe(2_000_000);
    expect(tuitionFor(s, "2026-12", { classes, lessons, attendance: [] }).amount).toBe(0);
  });

  it("maktab: avvalgidek sinf narxi, tafsilotsiz", () => {
    const db = seedDatabase(NOW);
    const out = buildInvoices("2027-01", db.students.filter((x) => x.institutionId === "inst_school"), [], 10, { classes: db.classes, lessons: db.lessons, attendance: db.attendance });
    expect(out.every((i) => i.amount === 3_500_000 && !i.lines)).toBe(true);
  });
});

describe("o'quv markazi: lidlar, ish haqi, filiallar", () => {
  const center = () => {
    const db = seedDatabase(NOW);
    return { db, adm: db.users.find((u) => u.id === "u_adm2")!, dir: db.users.find((u) => u.role === "director" && u.institutionId === "inst_center")! };
  };

  it("lid: qo'shish, sinov darsi, o'quvchiga aylantirish", () => {
    const { db, adm, dir } = center();
    const p = executeCommand(db, adm, "lead.save", { name: "Test Lid", phone: "90 123 00 01", interest: "IELTS", source: "telegram" }, NOW);
    applyPatch(db, p);
    const lead = p.upsert!.leads![0];
    expect(lead).toMatchObject({ status: "new", phone: "998901230001", institutionId: "inst_center" });
    // Ochiq lid takrorlanmaydi
    expect(() => executeCommand(db, adm, "lead.save", { name: "Boshqa", phone: "+998 90 123 00 01", interest: "", source: "other" }, NOW)).toThrow("err.leadExists");
    // Direktor faqat ko'radi
    expect(() => executeCommand(db, dir, "lead.save", { name: "D", phone: "90 123 00 02", interest: "", source: "other" }, NOW)).toThrow();
    // Sinov darsi: holat avtomatik "trial"
    applyPatch(db, executeCommand(db, adm, "lead.update", { id: lead.id, trialClassId: "c_ielts", trialDay: "2026-10-09" }, NOW));
    expect(db.leads.find((l) => l.id === lead.id)!.status).toBe("trial");
    expect(() => executeCommand(db, adm, "lead.update", { id: lead.id, status: "enrolled" }, NOW)).toThrow("err.leadConvert");
    // O'quvchi qilish: ota-ona telefoni lid raqami, Kvitansiya ID va login bilan
    const c = executeCommand(db, adm, "lead.convert", { id: lead.id, classId: "c_ielts", parentName: "Ona" }, NOW);
    applyPatch(db, c);
    const st = c.upsert!.students![0];
    expect(st).toMatchObject({ name: "Test Lid", classId: "c_ielts" });
    expect(st.receiptId).toMatch(/^\d{6}$/);
    expect(db.users.find((u) => st.parentIds.includes(u.id))!.phone).toBe("998901230001");
    expect(db.leads.find((l) => l.id === lead.id)).toMatchObject({ status: "enrolled", studentId: st.id });
    expect(() => executeCommand(db, adm, "lead.convert", { id: lead.id, classId: "c_ielts" }, NOW)).toThrow("err.leadConverted");
  });

  it("lidlarni faqat shu muassasa rahbariyati ko'radi", () => {
    const { db } = center();
    const see = (id: string) => scopeDatabase(db, db.users.find((u) => u.id === id)!).leads.length;
    expect(see("u_adm2")).toBeGreaterThan(0);
    expect(see("u_adm")).toBe(0); // maktab administratori
    expect(see("t_ielts")).toBe(0);
    // O'qituvchi boshqa o'qituvchining ish haqini ko'rmaydi
    const view = scopeDatabase(db, db.users.find((u) => u.id === "t_sat")!);
    expect(view.users.find((u) => u.id === "t_ielts")?.pay).toBeUndefined();
  });

  it("o'qituvchi ulushi: foiz, darsbay, belgilangan", () => {
    const lessons: Lesson[] = [
      { id: "a", classId: "g1", subject: "IELTS", teacherId: "t1", weekday: 1, start: "17:00", end: "18:00", room: "" },
      { id: "b", classId: "g1", subject: "IELTS", teacherId: "t2", weekday: 3, start: "17:00", end: "18:00", room: "" },
    ];
    const students = [{ id: "s1", institutionId: "i", name: "S", classId: "g1", parentIds: [], archived: false, parentConsent: true, faceTemplates: [] }] as Student[];
    const invoices = [{ id: "v", studentId: "s1", month: "2026-11", amount: 1_000_000, dueDay: "2026-11-05", payments: [{ id: "p", amount: 1_000_000, date: 0, method: "cash" as const, by: "x" }] }];
    // Noyabr 2026: dushanbalar 2, 9, 16, 23, 30 → 5 ta; 2 tasida davomat olingan
    const attendance = ["2026-11-02", "2026-11-09"].map((day) => ({ ...R("a", "present"), day, lessonId: "a" }));
    const input = { lessons, attendance, invoices: invoices as never, students };
    const t1 = { id: "t1", name: "", phone: "", role: "teacher" as const, subjects: [], childIds: [], active: true };
    const pct = payrollFor({ ...t1, pay: { mode: "percent", value: 40 } }, "2026-11", "2026-11-30", input);
    expect(pct).toMatchObject({ scheduled: 5, conducted: 2, base: 500_000, payout: 200_000 });
    expect(payrollFor({ ...t1, pay: { mode: "perLesson", value: 60_000 } }, "2026-11", "2026-11-30", input).payout).toBe(120_000);
    expect(payrollFor({ ...t1, pay: { mode: "fixed", value: 3_000_000 } }, "2026-11", "2026-11-10", input)).toMatchObject({ scheduled: 2, payout: 3_000_000 });
    expect(payrollFor(t1, "2026-11", "2026-11-30", input).payout).toBe(0);
  });

  it("ish haqi tekshiruvi va filiallar", () => {
    const { db, adm } = center();
    expect(() => executeCommand(db, adm, "teacher.save", { id: "t_sat", name: "X", phone: "998907777772", subjects: [], pay: { mode: "percent", value: 120 } }, NOW)).toThrow("err.pay");
    const inst = db.institutions.find((i) => i.id === "inst_center")!;
    // Guruh biriktirilgan filialni o'chirib bo'lmaydi
    expect(() => executeCommand(db, adm, "settings.save", { settings: { ...inst.settings, branches: inst.settings.branches!.filter((b) => b.id !== "br_chil") } }, NOW)).toThrow("err.branchInUse");
    // Yangi filial id oladi; noma'lum filial guruhga biriktirilmaydi
    const p = executeCommand(db, adm, "settings.save", { settings: { ...inst.settings, branches: [...inst.settings.branches!, { id: "", name: " Sergeli " }] } }, NOW);
    const added = p.upsert!.institutions![0].settings.branches!.at(-1)!;
    expect(added.id).toMatch(/^br/);
    expect(added.name).toBe("Sergeli");
    const c = executeCommand(db, adm, "class.save", { id: "c_sat", name: "SAT", monthlyFee: 0, branchId: "br_none" }, NOW);
    expect(c.upsert!.classes![0].branchId).toBeUndefined();
  });
});

describe("filial administratori", () => {
  it("faqat o'z filialini ko'radi va boshqaradi", () => {
    const db = seedDatabase(NOW);
    const yun = db.users.find((u) => u.id === "u_adm_yun")!;
    const view = scopeDatabase(db, yun);
    expect(view.classes.map((c) => c.id)).toEqual(["c_sat"]);
    // Faqat SAT guruhidagi (ikki guruhda bo'lsa ham) o'quvchilar
    expect(view.students.length).toBeGreaterThan(0);
    expect(view.students.every((s) => classIdsOf(s).includes("c_sat"))).toBe(true);
    expect(view.invoices.every((i) => view.students.some((s) => s.id === i.studentId))).toBe(true);
    // Boshqa filial guruhiga o'quvchi qo'sha olmaydi, o'zinikiga qo'shadi
    expect(() => executeCommand(db, yun, "student.save", { name: "A B", classId: "c_ielts", parents: [] }, NOW)).toThrow("err.branchForbidden");
    expect(executeCommand(db, yun, "student.save", { name: "A B", classId: "c_sat", parents: [] }, NOW).upsert!.students![0].classId).toBe("c_sat");
    // Faqat IELTS'dagi o'quvchiga tegolmaydi
    const ielts = db.students.find((s) => s.classId === "c_ielts" && !s.extraClassIds?.length)!;
    expect(() => executeCommand(db, yun, "student.archive", { id: ielts.id, archived: true }, NOW)).toThrow("err.branchForbidden");
    // Sozlamalarni o'zgartira olmaydi
    const inst = db.institutions.find((i) => i.id === "inst_center")!;
    expect(() => executeCommand(db, yun, "settings.save", { settings: inst.settings }, NOW)).toThrow("err.branchForbidden");
    // Hisob-varaq faqat o'z filiali o'quvchilariga
    const inv = executeCommand(db, yun, "invoice.generate", { month: "2027-03" }, NOW).upsert!.invoices!;
    expect(inv.length).toBeGreaterThan(0);
    expect(inv.every((i) => view.students.some((s) => s.id === i.studentId))).toBe(true);
    // Parol: boshqa filial o'quvchisiga bera olmaydi, o'qituvchiga beradi
    const ieltsUser = db.users.find((u) => u.id === ielts.userId)!;
    expect(canManageCredentials(yun, ieltsUser, db)).toBe(false);
    expect(canManageCredentials(yun, db.users.find((u) => u.id === "t_ielts")!, db)).toBe(true);
  });

  it("direktor administratorni filialga biriktiradi; ishlatilayotgan filial o'chmaydi", () => {
    const db = seedDatabase(NOW);
    const dir = db.users.find((u) => u.role === "director" && u.institutionId === "inst_center")!;
    const p = executeCommand(db, dir, "admin.save", { id: "u_adm2", name: "Otabek Sobirov", phone: "998908888888", branchIds: ["br_chil", "br_none"] }, NOW);
    expect(p.upsert!.users![0].branchIds).toEqual(["br_chil"]);
    const adm = db.users.find((u) => u.id === "u_adm2")!;
    const inst = db.institutions.find((i) => i.id === "inst_center")!;
    // SAT guruhini boshqa filialga o'tkazsak ham Yunusobod administratorga biriktirilgan
    db.classes.find((c) => c.id === "c_sat")!.branchId = "br_chil";
    expect(() => executeCommand(db, adm, "settings.save", { settings: { ...inst.settings, branches: inst.settings.branches!.filter((b) => b.id !== "br_yun") } }, NOW)).toThrow("err.branchInUse");
  });
});

describe("dam olish kunlari", () => {
  it("oraliq yoyiladi; darsbay va o'qituvchi ulushida dars soniga kirmaydi", () => {
    const settings = { holidays: [{ id: "h", from: "2027-03-21", to: "2027-03-23", name: "Navro'z" }] };
    const off = holidayDays(settings);
    expect([...off]).toEqual(["2027-03-21", "2027-03-22", "2027-03-23"]);
    expect(holidayOn(settings, "2027-03-22")?.name).toBe("Navro'z");
    expect(holidayOn(settings, "2027-03-24")).toBeUndefined();
    const db = seedDatabase(NOW);
    const input = { classes: db.classes, lessons: db.lessons, attendance: [] };
    const s = db.students.find((x) => x.id === "s_c0")!; // IELTS (oylik) + SAT (darsbay, Se/Pa)
    // Mart 2027: SAT darslari 9 ta; 23-mart seshanba dam olish → 8 ta
    const sat = (t: ReturnType<typeof tuitionFor>) => t.lines.find((l) => l.classId === "c_sat")!;
    expect(sat(tuitionFor(s, "2027-03", input)).lessons).toBe(9);
    expect(sat(tuitionFor(s, "2027-03", { ...input, holidays: off })).lessons).toBe(8);
    // Oylik narx o'zgarmaydi
    expect(tuitionFor(s, "2027-03", { ...input, holidays: off }).lines.find((l) => l.classId === "c_ielts")!.amount).toBe(900_000);
  });

  it("sozlamada tekshiriladi va saralanadi", () => {
    const db = seedDatabase(NOW);
    const adm = db.users.find((u) => u.id === "u_adm2")!;
    const inst = db.institutions.find((i) => i.id === "inst_center")!;
    expect(() => executeCommand(db, adm, "settings.save", { settings: { ...inst.settings, holidays: [{ id: "", from: "2027-01-05", to: "2027-01-02", name: "X" }] } }, NOW)).toThrow("err.dates");
    const p = executeCommand(db, adm, "settings.save", { settings: { ...inst.settings, holidays: [{ id: "", from: "2027-06-01", to: "", name: " Yozgi " }, { id: "", from: "2027-01-02", to: "2027-01-02", name: "A" }] } }, NOW);
    const hs = p.upsert!.institutions![0].settings.holidays!;
    expect(hs.map((h) => [h.from, h.to, h.name])).toEqual([["2027-01-02", "2027-01-02", "A"], ["2027-06-01", "2027-06-01", "Yozgi"]]);
    expect(hs.every((h) => h.id.startsWith("hd"))).toBe(true);
  });
});

describe("qarz eslatmasi", () => {
  it("qarzdorlarga bir marta; katta yoshliga o'ziga; filial bo'yicha", () => {
    const db = seedDatabase(NOW);
    const adm = db.users.find((u) => u.id === "u_adm2")!;
    const debt = db.invoices.filter((i) => db.students.find((s) => s.id === i.studentId)?.institutionId === "inst_center" && i.amount > i.payments.reduce((a, p) => a + p.amount, 0));
    expect(debt.length).toBeGreaterThan(0);
    const p = executeCommand(db, adm, "payment.remind", {}, NOW);
    applyPatch(db, p);
    expect(p.upsert!.invoices!.length).toBe(debt.length);
    const n = p.upsert!.notifications!;
    expect(n.every((x) => x.key.startsWith("notif.debt") && x.type === "payment")).toBe(true);
    // Katta yoshli o'quvchi (Rustam) o'zi oladi, havola o'quvchi sahifasiga
    const adult = db.students.find((s) => s.id === "s_d3")!;
    if (debt.some((i) => i.studentId === adult.id)) expect(n.find((x) => x.userId === adult.userId)?.link).toBe("/student/payments");
    expect(translate("uz", n[0].key, n[0].params)).toMatch(/to'lanmagan/);
    // Takror: hammasi yaqinda eslatilgan
    expect(() => executeCommand(db, adm, "payment.remind", {}, NOW + 3_600_000)).toThrow("err.remindNone");
    expect(executeCommand(db, adm, "payment.remind", {}, NOW + 21 * 3_600_000).upsert!.invoices!.length).toBe(debt.length);
    // Direktor yubora olmaydi
    const dir = db.users.find((u) => u.role === "director" && u.institutionId === "inst_center")!;
    expect(() => executeCommand(db, dir, "payment.remind", {}, NOW + 30 * 3_600_000)).toThrow();
  });
});

describe("katta yoshli o'quvchi yozishmasi", () => {
  it("o'quvchi o'qituvchiga yozadi, o'qituvchi javob beradi; boshqalar yoza olmaydi", () => {
    const db = seedDatabase(NOW);
    const adult = db.students.find((s) => s.id === "s_d3")!;
    const me = db.users.find((u) => u.id === adult.userId)!;
    const p = executeCommand(db, me, "message.send", { studentId: adult.id, teacherId: "t_ielts", text: "Salom, uy vazifasi qaysi?" }, NOW);
    applyPatch(db, p);
    const th = p.upsert!.threads![0];
    expect(th.parentId).toBe(me.id);
    expect(p.upsert!.notifications![0]).toMatchObject({ userId: "t_ielts", link: `/teacher/messages/${th.id}` });
    const teacher = db.users.find((u) => u.id === "t_ielts")!;
    const r = executeCommand(db, teacher, "message.send", { studentId: adult.id, teacherId: "t_ielts", parentId: me.id, text: "Writing 2" }, NOW);
    expect(r.upsert!.notifications![0]).toMatchObject({ userId: me.id, link: `/student/messages/${th.id}` });
    applyPatch(db, r);
    // O'quvchi o'z yozishmasini ko'radi, o'qituvchi uning ismini ko'radi
    expect(scopeDatabase(db, me).messages.length).toBe(2);
    expect(scopeDatabase(db, teacher).users.some((u) => u.id === me.id)).toBe(true);
    // Voyaga yetmagan o'quvchi yoza olmaydi
    const kid = db.students.find((s) => !s.adult && s.userId)!;
    const kidUser = db.users.find((u) => u.id === kid.userId)!;
    expect(() => executeCommand(db, kidUser, "message.send", { studentId: kid.id, teacherId: "t_math", text: "x" }, NOW)).toThrow();
  });
});

describe("kirish tekshiruvi", () => {
  it("noto'g'ri tur, uzunlik, format va ortiqcha maydonlar", () => {
    const db = seedDatabase(NOW);
    const adm = db.users.find((u) => u.id === "u_adm2")!;
    const bad = (name: string, input: unknown, field: string) => {
      try { executeCommand(db, adm, name as never, input as never, NOW); } catch (e) {
        expect((e as { key: string; params: { field: string } }).key).toBe("err.invalid");
        expect((e as { params: { field: string } }).params.field).toBe(field);
        return;
      }
      throw new Error("o'tib ketdi: " + name);
    };
    bad("lead.save", { name: 123, phone: "901234567", interest: "", source: "instagram" }, "name");
    bad("lead.save", { name: "x".repeat(500), phone: "901234567", interest: "", source: "instagram" }, "name");
    bad("lead.save", { name: "A", phone: "90<script>", interest: "", source: "instagram" }, "phone");
    bad("lead.save", { name: "A", phone: "901234567", interest: "", source: "hack" }, "source");
    bad("payment.add", { invoiceId: "x", amount: -5, method: "cash" }, "amount");
    bad("invoice.generate", { month: "2026-13" }, "month");
    bad("lesson.save", { classId: "c_sat", subject: "M", teacherId: "t_sat", weekday: 8, start: "17:00", end: "18:00", room: "" }, "weekday");
    bad("homework.save", { classId: "c_sat", subject: "M", title: "T", description: "", dueDay: "2026-02-30", attachments: [] }, "dueDay");
    bad("submission.submit", { homeworkId: "h", text: "", attachments: [{ id: "a", name: "x", type: "t", size: 1, url: "javascript:alert(1)" }] }, "attachments.0.url");
    bad("attendance.mark", { lessonId: "l", day: "2026-10-08", marks: [{ studentId: "s", status: "present", source: "manual", snapshot: "data:text/html;base64,AAAA" }] }, "marks.0.snapshot");
    // Ortiqcha maydon yozuvga tushmaydi
    const p = executeCommand(db, adm, "lead.save", { name: "Toza", phone: "901112299", interest: "", source: "other", status: "enrolled", institutionId: "inst_school" } as never, NOW);
    expect(p.upsert!.leads![0]).toMatchObject({ status: "new", institutionId: "inst_center" });
    const inst = db.institutions.find((i) => i.id === "inst_center")!;
    const s = executeCommand(db, adm, "settings.save", { settings: { ...inst.settings, isAdmin: true, nvr: { enabled: true, keyHash: "a".repeat(64) } } } as never, NOW);
    expect(s.upsert!.institutions![0].settings).not.toHaveProperty("isAdmin");
    expect(s.upsert!.institutions![0].settings.nvr).toEqual(inst.settings.nvr);
  });
});

describe("rahbariyat paroli", () => {
  it("direktor va administratorga uzun parol; ota-ona va o'quvchiga 6 raqam", () => {
    for (let i = 0; i < 20; i++) {
      const p = generatePassword("admin");
      expect(p).toMatch(/^[a-zA-Z2-9]{10}$/);
      expect(p).toMatch(/\d/);
      expect(generatePassword("parent")).toMatch(/^\d{6}$/);
    }
    expect(() => checkNewPassword("246810", "director")).toThrow("err.passwordShort");
    expect(() => checkNewPassword("abcdefghijk", "admin")).toThrow("err.passwordStaff");
    expect(() => checkNewPassword("Toshkent2026", "admin")).not.toThrow();
    expect(() => checkNewPassword("482915", "parent")).not.toThrow();
  });
});

describe("TOTP (ikki bosqichli kirish)", () => {
  it("RFC 6238 test vektori va qayta ishlatishdan himoya", async () => {
    // RFC 6238, SHA1, kalit "12345678901234567890", T=59s → 94287082 (oxirgi 6 raqam: 287082)
    const secret = base32Encode(new TextEncoder().encode("12345678901234567890"));
    expect(await totpCode(secret, 1)).toBe("287082");
    expect(await totpCode(secret, Math.floor(1111111109 / 30))).toBe("081804");
    const now = 1_700_000_000_000;
    const code = await totpCode(secret, totpStep(now));
    const step = await verifyTotp(secret, code, now);
    expect(step).toBe(totpStep(now));
    // Xuddi shu kod ikkinchi marta qabul qilinmaydi
    expect(await verifyTotp(secret, code, now, step!)).toBeNull();
    expect(await verifyTotp(secret, "000000", now)).toBeNull();
    expect(base32Decode(base32Encode(new Uint8Array([1, 2, 3, 250])))).toEqual(new Uint8Array([1, 2, 3, 250]));
    expect(newBackupCodes()).toHaveLength(10);
  });
});

describe("bir kishi — bir nechta profil", () => {
  it("o'qituvchi farzandi shu maktabda: ikki profil, kirishda o'qituvchi, ota-onaga o'tish mumkin", () => {
    const db = seedDatabase(NOW);
    const all = findLoginCandidates(db, "90 333 33 33");
    expect(all.map((u) => u.role)).toEqual(["teacher", "parent"]);
    expect(findLoginUser(db, "998903333333").role).toBe("teacher");
    const teacher = all[0];
    expect(linkedProfiles(db, teacher).map((u) => u.id)).toEqual(["u_tparent"]);
    // Ota-ona profili faqat o'z farzandini ko'radi, o'qituvchi sinflarini emas
    const asParent = scopeDatabase(db, all[1]);
    expect(asParent.students.map((s) => s.id)).toEqual(["s_a2"]);
    expect(asParent.lessons.every((l) => l.classId === "c_5a")).toBe(true);
  });

  it("administrator o'qituvchi raqamini ota-ona sifatida qo'sha oladi (alohida profil)", () => {
    const db = seedDatabase(NOW);
    const adm = db.users.find((u) => u.id === "u_adm")!;
    const p = executeCommand(db, adm, "student.save", { name: "Yangi Bola", classId: "c_7b", parents: [{ name: "Gulnora Rahimova", phone: "90 666 66 61" }] }, NOW);
    applyPatch(db, p);
    const profiles = phoneProfiles(db, "998906666661");
    expect(profiles.map((u) => u.role)).toEqual(["teacher", "parent"]);
    expect(profiles[1].id).not.toBe("t_uzb");
    // Ikkinchi farzand: o'sha ota-ona profili
    applyPatch(db, executeCommand(db, adm, "student.save", { name: "Ikkinchi Bola", classId: "c_5a", parents: [{ name: "Gulnora Rahimova", phone: "90 666 66 61" }] }, NOW));
    expect(phoneProfiles(db, "998906666661").length).toBe(2);
    expect(phoneProfiles(db, "998906666661")[1].childIds.length).toBe(2);
  });

  it("rahbariyat profiliga parolsiz o'tib bo'lmaydi; boshqa muassasa profiliga ham", () => {
    const db = seedDatabase(NOW);
    const adm = db.users.find((u) => u.id === "u_adm")!;
    // Direktor shu maktabda ota-ona ham
    applyPatch(db, executeCommand(db, adm, "student.save", { name: "Direktor Farzandi", classId: "c_5a", parents: [{ name: "Nodira Yusupova", phone: "90 111 11 11" }] }, NOW));
    const dir = db.users.find((u) => u.id === "u_dir")!;
    const parent = phoneProfiles(db, "998901111111").find((u) => u.role === "parent")!;
    expect(linkedProfiles(db, dir).map((u) => u.id)).toEqual([parent.id]);
    expect(linkedProfiles(db, parent)).toEqual([]);
    // Boshqa muassasada ota-ona: alohida, bog'lanmaydi
    const adm2 = db.users.find((u) => u.id === "u_adm2")!;
    applyPatch(db, executeCommand(db, adm2, "student.save", { name: "Markaz Bola", classId: "c_ielts", parents: [{ name: "D", phone: "90 333 33 33" }] }, NOW));
    const t = db.users.find((u) => u.id === "t_math")!;
    expect(phoneProfiles(db, "998903333333").length).toBe(3);
    expect(linkedProfiles(db, t).map((u) => u.id)).toEqual(["u_tparent"]);
  });

  it("bir muassasada bir rolda bitta profil; super admin raqami band", () => {
    const db = seedDatabase(NOW);
    const adm = db.users.find((u) => u.id === "u_adm")!;
    expect(() => executeCommand(db, adm, "teacher.save", { name: "X", phone: "90 333 33 33", subjects: ["Kimyo"] }, NOW)).toThrow("err.phoneTaken");
    expect(() => executeCommand(db, adm, "student.save", { name: "Y", classId: "c_5a", parents: [{ name: "S", phone: "90 000 00 00" }] }, NOW)).toThrow("err.phoneTaken");
    // Ota-ona raqami o'qituvchi sifatida: ruxsat (alohida profil)
    expect(() => executeCommand(db, adm, "teacher.save", { name: "Feruza Karimova", phone: "90 555 55 55", subjects: ["Kimyo"] }, NOW)).not.toThrow();
  });
});

describe("yuz namunasi uzatishda ixcham", () => {
  it("int8: hajm ~6 marta kichik, kosinus o'xshashlik deyarli o'zgarmaydi", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    const norm = (v: number[]) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
    const cos = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0) / (Math.hypot(...a) * Math.hypot(...b));
    for (let k = 0; k < 20; k++) {
      const a = norm(Array.from({ length: 512 }, rnd));
      const b = norm(a.map((x) => x + rnd() * 0.05));
      const qa = unpackTemplate(packTemplate(a));
      expect(Math.abs(cos(qa, b) - cos(a, b))).toBeLessThan(0.003);
      expect(packTemplate(a).length).toBeLessThan(JSON.stringify(a.map((x) => Math.round(x * 1e5) / 1e5)).length / 5);
    }
    const db = seedDatabase(NOW);
    db.students[0].faceTemplates = [norm(Array.from({ length: 512 }, rnd))];
    const wire = JSON.parse(JSON.stringify(packDatabase(db)));
    const back = unpackDatabase(wire);
    expect(back.students[0].faceTemplates[0].length).toBe(512);
    expect((back.students[0] as { faceQ?: unknown }).faceQ).toBeUndefined();
    expect(cos(back.students[0].faceTemplates[0], db.students[0].faceTemplates[0])).toBeGreaterThan(0.999);
  });
});

describe("o'quvchilarni fayldan qo'shish va rozilik", () => {
  it("ko'p o'quvchi bir yo'la: aka-ukaning ota-onasi bitta profil, xato qator raqami bilan", () => {
    const db = seedDatabase(NOW);
    const adm = db.users.find((u) => u.id === "u_adm")!;
    const p = executeCommand(db, adm, "student.import", { students: [
      { name: "Ali Valiyev", classId: "c_5a", birthDay: "2014-03-02", parents: [{ name: "Ona", phone: "93 700 00 01" }] },
      { name: "Vali Valiyev", classId: "c_7b", parents: [{ name: "Ona", phone: "93 700 00 01" }], studentPhone: "93 700 00 02" },
    ] }, NOW);
    applyPatch(db, p);
    const kids = db.students.filter((s) => s.name.endsWith("Valiyev"));
    expect(kids.length).toBe(2);
    expect(new Set(kids.map((k) => k.receiptId)).size).toBe(2);
    const parents = db.users.filter((u) => u.phone === "998937000001");
    expect(parents.length).toBe(1);
    expect(parents[0].childIds.sort()).toEqual(kids.map((k) => k.id).sort());
    expect(kids.find((k) => k.name === "Ali Valiyev")!.birthDay).toBe("2014-03-02");
    // 2-qatorda noto'g'ri sinf → hech biri qo'shilmaydi
    const before = db.students.length;
    expect(() => executeCommand(db, adm, "student.import", { students: [
      { name: "Bir", classId: "c_5a", parents: [] }, { name: "Ikki", classId: "c_yoq", parents: [] },
    ] }, NOW)).toThrow("err.importRow");
    expect(db.students.length).toBe(before);
    // O'qituvchi qo'sha olmaydi
    expect(() => executeCommand(db, db.users.find((u) => u.id === "t_math")!, "student.import", { students: [{ name: "X", classId: "c_7b", parents: [] }] }, NOW)).toThrow();
  });

  it("rozilik: faqat ota-ona beradi (vaqti bilan), administrator faqat bekor qiladi; rasm rozilikgacha o'qituvchiga ko'rinmaydi", () => {
    const db = seedDatabase(NOW);
    const adm = db.users.find((u) => u.id === "u_adm")!;
    const s = db.students.find((x) => x.id === "s_a2")!;
    s.parentConsent = false;
    applyPatch(db, executeCommand(db, adm, "student.photo", { studentId: s.id, photo: "https://api.example.uz/files/0123456789abcdef0123456789abcdef" }, NOW));
    const teacher = db.users.find((u) => u.id === "t_uzb")!;
    expect(scopeDatabase(db, teacher).students.find((x) => x.id === s.id)!.photo).toBeUndefined();
    expect(scopeDatabase(db, adm).students.find((x) => x.id === s.id)!.photo).toMatch(/files/);
    expect(() => executeCommand(db, adm, "consent.set", { studentId: s.id, consent: true }, NOW)).toThrow();
    const parent = db.users.find((u) => u.id === "u_tparent")!;
    applyPatch(db, executeCommand(db, parent, "consent.set", { studentId: s.id, consent: true }, NOW));
    const after = db.students.find((x) => x.id === s.id)!;
    expect(after).toMatchObject({ parentConsent: true, consentAt: NOW, consentBy: parent.id });
    expect(scopeDatabase(db, teacher).students.find((x) => x.id === s.id)!.photo).toMatch(/files/);
    // Bekor qilish: rasm va namunalar o'chadi
    applyPatch(db, executeCommand(db, adm, "consent.set", { studentId: s.id, consent: false }, NOW));
    expect(db.students.find((x) => x.id === s.id)).toMatchObject({ parentConsent: false, photo: undefined, faceTemplates: [] });
  });
});
