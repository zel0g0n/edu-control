import { describe, expect, it } from "vitest";
import {
  arrivalStatus, attendanceRate, billingTotals, clickPaymentUrl, findConflicts, invoicesToCreate, normalizePhone,
  paymePaymentUrl, scopeDatabase, scopePatch, seedDatabase, suggestTermGrade, summarizeDay, weightedAverage, type AttendanceRecord, type Grade, type Lesson,
} from "./index";

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
    expect(new Set(db.users.map((u) => u.phone)).size).toBe(db.users.length);
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
