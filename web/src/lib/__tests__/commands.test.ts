import { CommandError, invoiceRemaining } from "@edunazorat/shared";
import { beforeEach, describe, expect, it } from "vitest";

import { AppStore } from "../data/store";
import { LocalTransport } from "../data/transport";

// Payshanba, 8-oktabr 2026, 10:00
const NOW = new Date(2026, 9, 8, 10, 0).getTime();

/** Bitta test ichidagi barcha foydalanuvchilar bitta "server" bazasini ko'radi. */
class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}
let shared = new MemStorage();
beforeEach(() => { shared = new MemStorage(); });

async function as(phone: string) {
  const s = new AppStore(new LocalTransport(() => NOW, shared as unknown as Storage, true), () => NOW);
  s.status = "ready";
  await s.signIn(phone, "1111");
  return s;
}
const TEACHER = "998903333333", PARENT = "998905555555", DIRECTOR = "998901111111", STUDENT = "998904444444", ADMIN = "998900000000";

async function expectErr(p: Promise<unknown>, key: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof CommandError && e.key === key);
}

describe("kirish", () => {
  it("noto'g'ri kod va noma'lum raqam", async () => {
    const s = new AppStore(new LocalTransport(() => NOW, null), () => NOW);
    await expectErr(s.signIn(TEACHER, "0000"), "err.otp");
    await expectErr(s.signIn("998911111111", "1111"), "err.userNotFound");
  });
  it("bloklangan muassasa", async () => {
    const admin = await as(ADMIN);
    await admin.run("institution.setActive", { id: "inst_center", active: false });
    await expectErr(admin.signIn("998902222222", "1111"), "err.institutionBlocked");
  });
});

describe("davomat dars bo'yicha", () => {
  let t: AppStore;
  let lessonId: string;
  beforeEach(async () => {
    t = await as(TEACHER);
    lessonId = t.lessonsOfTeacherOn("t_math", 4).find((l) => l.classId === "c_7b")!.id;
  });

  it("belgilash va ota-onaga xabar (faqat o'z farzandi)", async () => {
    const before = (await as(PARENT)).notificationsOf("u_parent").length;
    // O'qituvchi boshqa foydalanuvchilarning bildirishnomalarini ko'rmaydi
    expect(t.notificationsOf("u_parent")).toHaveLength(0);
    await t.run("attendance.mark", { lessonId, day: t.today, marks: [{ studentId: "s_b0", status: "late", source: "face", snapshot: "data:x" }] });
    expect(t.attendanceRecord("s_b0", lessonId, t.today)?.status).toBe("late");
    const p = await as(PARENT);
    const n = p.notificationsOf("u_parent");
    expect(n.length).toBe(before + 1);
    expect(n[0]).toMatchObject({ key: "notif.attendance.late.face", image: "data:x" });
    // Qayta belgilash: yozuv yangilanadi, takror xabar yo'q
    await t.run("attendance.mark", { lessonId, day: t.today, marks: [{ studentId: "s_b0", status: "late", source: "manual" }] });
    expect(t.attendanceOfLesson(lessonId, t.today)).toHaveLength(1);
    expect((await as(PARENT)).notificationsOf("u_parent").length).toBe(before + 1);
  });

  it("boshqa o'qituvchining darsiga ruxsat yo'q", async () => {
    const other = t.db.lessons.find((l) => l.teacherId !== "t_math" && l.classId === "c_7b")!;
    await expectErr(t.run("attendance.mark", { lessonId: other.id, day: t.today, marks: [{ studentId: "s_b0", status: "present", source: "manual" }] }), "err.forbidden");
  });

  it("kunlik xulosa darslardan", async () => {
    const s = t.daySummary("s_a0", t.today);
    expect(s.marked).toBeGreaterThan(0);
  });
});

describe("baholar", () => {
  it("tur va izoh bilan, chorak bahosi", async () => {
    const t = await as(TEACHER);
    await t.run("grade.add", { studentId: "s_b0", subject: "Matematika", value: 5, type: "control", day: t.today, comment: "A'lo" });
    const g = t.gradesOfStudent("s_b0", { subject: "Matematika" })[0];
    expect(g).toMatchObject({ value: 5, type: "control", comment: "A'lo" });
    await expectErr(t.run("grade.add", { studentId: "s_b0", subject: "Fizika", value: 5, type: "current", day: t.today }), "err.forbidden");
    await expectErr(t.run("grade.add", { studentId: "s_b0", subject: "Matematika", value: 6, type: "current", day: t.today }), "err.grade");
    const term = t.currentTerm("inst_school")!;
    await t.run("grade.setFinal", { studentId: "s_b0", subject: "Matematika", termId: term.id, type: "term", value: 4 });
    await t.run("grade.setFinal", { studentId: "s_b0", subject: "Matematika", termId: term.id, type: "term", value: 5 });
    expect(t.finalGrade("s_b0", "Matematika", term.id)?.value).toBe(5);
    expect(t.db.grades.filter((x) => x.type === "term")).toHaveLength(1);
    await t.run("grade.setFinal", { studentId: "s_b0", subject: "Matematika", termId: term.id, type: "term", value: null });
    expect(t.finalGrade("s_b0", "Matematika", term.id)).toBeUndefined();
  });
});

describe("vazifa va topshiriq", () => {
  it("o'quvchi topshiradi, o'qituvchi baholaydi", async () => {
    const t = await as(TEACHER);
    const p = await t.run("homework.save", { classId: "c_7b", subject: "Matematika", title: "Test", description: "", dueDay: t.today, attachments: [{ id: "f", name: "a.pdf", type: "application/pdf", size: 10, url: "data:," }] });
    const hwId = p.upsert!.homeworks![0].id;
    const st = await as(STUDENT);
    expect(st.notificationsOf("u_student").some((n) => n.key === "notif.homework")).toBe(true);
    await expectErr(st.run("submission.submit", { homeworkId: hwId, text: " ", attachments: [] }), "err.emptySubmission");
    await st.run("submission.submit", { homeworkId: hwId, text: "Javob", attachments: [] });

    const t2 = await as(TEACHER);
    const sub = t2.submission(hwId, "s_b0")!;
    expect(t2.notificationsOf("t_math").some((n) => n.key === "notif.submission.new")).toBe(true);
    await t2.run("submission.review", { id: sub.id, status: "checked", grade: 4, feedback: "Yaxshi" });
    expect(t2.submission(hwId, "s_b0")).toMatchObject({ status: "checked", grade: 4 });
    expect(t2.gradesOfStudent("s_b0").some((g) => g.comment === "Uy vazifasi: Test" && g.type === "written")).toBe(true);

    const st2 = await as(STUDENT);
    await expectErr(st2.run("submission.submit", { homeworkId: hwId, text: "yana", attachments: [] }), "err.alreadyChecked");
  });

  it("katta fayl rad etiladi", async () => {
    const t = await as(TEACHER);
    await expectErr(
      t.run("homework.save", { classId: "c_7b", subject: "Matematika", title: "X", description: "", dueDay: t.today, attachments: [{ id: "f", name: "big", type: "x", size: 5e6, url: "" }] }),
      "err.fileTooLarge",
    );
  });
});

describe("direktor boshqaruvi", () => {
  it("o'quvchi qo'shish, ota-onani telefon bo'yicha biriktirish", async () => {
    const d = await as(DIRECTOR);
    const p = await d.run("student.save", {
      name: "Yangi O'quvchi", classId: "c_5a", parents: [{ name: "Feruza Karimova", phone: "90 555 55 55" }, { name: "Ota", phone: "+998 93 000 00 01" }], studentPhone: "93 000 00 02",
    });
    const s = p.upsert!.students![0];
    expect(d.userById("u_parent")!.childIds).toContain(s.id);
    const newParent = d.db.users.find((u) => u.phone === "998930000001")!;
    expect(newParent).toMatchObject({ role: "parent", childIds: [s.id] });
    expect(d.db.users.find((u) => u.phone === "998930000002")).toMatchObject({ role: "student", studentId: s.id });
    // Ota-onani olib tashlash
    await d.run("student.save", { id: s.id, name: s.name, classId: "c_5a", parents: [{ name: "Ota", phone: "998930000001" }] });
    expect(d.userById("u_parent")!.childIds).not.toContain(s.id);
    await expectErr(d.run("student.save", { name: "X", classId: "c_5a", parents: [{ name: "O'qituvchi", phone: "998903333333" }] }), "err.phoneTaken");
  });

  it("o'qituvchi, sinf va jadval to'qnashuvi", async () => {
    const d = await as(DIRECTOR);
    const tp = await d.run("teacher.save", { name: "Yangi Ustoz", phone: "97 111 22 33", subjects: ["Kimyo", " Biologiya "] });
    const tid = tp.upsert!.users![0].id;
    expect(d.userById(tid)!.subjects).toEqual(["Kimyo", "Biologiya"]);
    const cp = await d.run("class.save", { name: "8-A", homeroomTeacherId: tid, monthlyFee: 3_000_000 });
    const cid = cp.upsert!.classes![0].id;
    await expectErr(d.run("class.save", { name: "8-a", monthlyFee: 1 }), "err.classExists");
    await d.run("lesson.save", { classId: cid, subject: "Kimyo", teacherId: tid, weekday: 1, start: "08:30", end: "09:15", room: "401" });
    // Matematika o'qituvchisi dushanba 09:25 da 7-B da
    await expectErr(d.run("lesson.save", { classId: cid, subject: "Matematika", teacherId: "t_math", weekday: 1, start: "09:30", end: "10:00", room: "402" }), "err.conflict.teacher");
    await expectErr(d.run("lesson.save", { classId: cid, subject: "Biologiya", teacherId: tid, weekday: 1, start: "09:00", end: "09:40", room: "401" }), "err.conflict.class");
    await expectErr(d.run("teacher.setActive", { id: tid, active: false }), "err.teacherHasLessons");
    await expectErr(d.run("class.delete", { id: "c_5a" }), "err.classNotEmpty");
    await d.run("class.delete", { id: cid });
    expect(d.lessonsOfClass(cid)).toHaveLength(0);
  });

  it("oylik hisob-varaqlar va to'lov", async () => {
    const d = await as(DIRECTOR);
    const next = "2026-11";
    const p = await d.run("invoice.generate", { month: next });
    expect(p.upsert!.invoices!.length).toBe(d.studentsOfInstitution("inst_school").length);
    const again = await d.run("invoice.generate", { month: next });
    expect(again.upsert?.invoices ?? []).toHaveLength(0);
    const inv = d.invoicesOfStudent("s_b0").find((i) => i.month === next)!;
    await expectErr(d.run("payment.add", { invoiceId: inv.id, amount: inv.amount + 1, method: "cash" }), "err.amountRange");
    await d.run("payment.add", { invoiceId: inv.id, amount: 1_000_000, method: "card" });
    expect(invoiceRemaining(d.invoicesOfStudent("s_b0").find((i) => i.month === next)!)).toBe(inv.amount - 1_000_000);
  });

  it("boshqa muassasaga ruxsat yo'q", async () => {
    const d = await as("998902222222");
    await expectErr(d.run("student.save", { name: "X", classId: "c_5a", parents: [] }), "err.notFound");
    await expectErr(d.run("institution.setActive", { id: "inst_school", active: false }), "err.forbidden");
  });
});

describe("ota-ona", () => {
  it("demo onlayn to'lov va yozishma", async () => {
    const p = await as(PARENT);
    const inv = p.invoicesOfStudent("s_b0").find((i) => invoiceRemaining(i) > 0)!;
    await p.run("payment.demoOnline", { invoiceId: inv.id, provider: "click" });
    expect(invoiceRemaining(p.invoicesOfStudent("s_b0").find((i) => i.id === inv.id)!)).toBe(0);
    await p.run("message.send", { studentId: "s_b0", teacherId: "t_math", text: "Rahmat!" });
    expect(p.messagesOf("th_1").at(-1)?.text).toBe("Rahmat!");
    await expectErr(p.run("message.send", { studentId: "s_b1", teacherId: "t_math", text: "x" }), "err.forbidden");
    const t = await as(TEACHER);
    expect(t.unreadInThread("th_1", "t_math")).toBe(1);
    await t.run("thread.read", { threadId: "th_1" });
    expect(t.unreadInThread("th_1", "t_math")).toBe(0);
  });

  it("rozilik bekor qilinsa namuna o'chadi", async () => {
    const t = await as(TEACHER);
    await t.run("face.enroll", { studentId: "s_b0", templates: [new Array(192).fill(0.1)], photo: "p" });
    const p = await as(PARENT);
    await p.run("consent.set", { studentId: "s_b0", consent: false });
    expect(p.student("s_b0")).toMatchObject({ parentConsent: false, faceTemplates: [], facePhoto: undefined });
    const t2 = await as(TEACHER);
    await expectErr(t2.run("face.enroll", { studentId: "s_b0", templates: [new Array(192).fill(0.1)] }), "err.noConsent");
  });
});
