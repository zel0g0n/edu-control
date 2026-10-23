import { describe, expect, it } from "vitest";
import { applyPatch, dayKey, executeCommand, findAttendance, isZamsLinked, isoWeekday, seedDatabase, zamsClassKey, zamsLessonPatch, zamsRosterPatch, type Database } from "./index";

const NOW = new Date(2026, 9, 19, 9, 0).getTime(); // dushanba
const TODAY = dayKey(NOW);

function setup() {
  const db = seedDatabase(NOW) as Database;
  const inst = db.institutions.find((i) => i.id === "inst_school")!;
  return { db, inst: () => db.institutions.find((i) => i.id === inst.id)! };
}

describe("Z_AMS ro'yxati", () => {
  it("sinf nomlari bir xil kalitga keladi", () => {
    expect(zamsClassKey("5a")).toBe("5-a");
    expect(zamsClassKey("5 A")).toBe("5-a");
    expect(zamsClassKey("5-А")).toBe("5-a");   // kirill A
    expect(zamsClassKey("11-B")).toBe("11-b");
  });

  it("birinchi ulanish: mavjud o'quvchi bog'lanadi, yangisi yaratiladi, sinf yaratiladi", () => {
    const { db, inst } = setup();
    const aziz = db.students.find((s) => s.name === "Aziz Karimov")!;
    const parentsBefore = aziz.parentIds;
    const { patch, result } = zamsRosterPatch(db, inst(), 7, {
      full: true,
      students: [
        { id: 1, name: "aziz  karimov", className: "5a" },          // mavjud (ism va sinf yozilishi boshqacha)
        { id: 2, name: "Yangi Bola", className: "5-A" },
        { id: 3, name: "Boshqa Sinf", className: "9-V" },          // yangi sinf
      ],
    }, NOW);
    applyPatch(db, patch);
    expect(result).toMatchObject({ linked: 1, created: 2, classesCreated: ["9-V"] });
    const linked = db.students.find((s) => s.id === aziz.id)!;
    expect(linked.externalId).toBe("zams:7:1");
    expect(linked.parentIds).toEqual(parentsBefore);               // ota-onalar saqlanadi
    const fresh = db.students.find((s) => s.externalId === "zams:7:2")!;
    expect(fresh.classId).toBe("c_5a");
    expect(fresh.parentIds).toEqual([]);
    expect(db.institutions.find((i) => i.id === "inst_school")!.settings.zams?.schoolId).toBe(7);
  });

  it("qayta yuborish: o'zgarmagan, ism/sinf o'zgarishi, arxivlash, tiklash", () => {
    const { db, inst } = setup();
    const base = [{ id: 1, name: "Aziz Karimov", className: "5-A" }, { id: 2, name: "Yangi Bola", className: "5-A" }];
    applyPatch(db, zamsRosterPatch(db, inst(), 7, { full: true, students: base }, NOW).patch);
    const again = zamsRosterPatch(db, inst(), 7, { full: true, students: base }, NOW);
    expect(again.result).toMatchObject({ created: 0, linked: 0, updated: 0, unchanged: 2 });

    const aziz = db.students.find((s) => s.externalId === "zams:7:1")!;
    const r = zamsRosterPatch(db, inst(), 7, { full: true, students: [{ id: 1, name: "Aziz Karimov", className: "7-B" }] }, NOW);
    applyPatch(db, r.patch);
    expect(r.result).toMatchObject({ updated: 1, archived: 1 });        // 2-o'quvchi ro'yxatda yo'q -> arxiv
    const moved = db.students.find((s) => s.id === aziz.id)!;
    expect(moved.classId).toBe("c_7b");
    expect(moved.parentIds).toEqual(aziz.parentIds);
    expect(moved.receiptId).toBe(aziz.receiptId);
    expect(db.students.find((s) => s.externalId === "zams:7:2")!.archived).toBe(true);

    const back = zamsRosterPatch(db, inst(), 7, { students: [{ id: 2, name: "Yangi Bola", className: "5-A" }] }, NOW);
    applyPatch(db, back.patch);
    expect(back.result.restored).toBe(1);
  });

  it("noto'g'ri yoki bo'sh ro'yxat ommaviy arxivlamaydi", () => {
    const { db, inst } = setup();
    const many = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: `Bola ${i + 1}`, className: "5-A" }));
    applyPatch(db, zamsRosterPatch(db, inst(), 7, { full: true, students: many }, NOW).patch);
    expect(() => zamsRosterPatch(db, inst(), 7, { full: true, students: many.slice(0, 3) }, NOW)).toThrow("err.zamsMassArchive");
    expect(() => zamsRosterPatch(db, inst(), 7, { full: true, students: [] }, NOW)).toThrow();
  });

  it("rasm va rozilik ma'lumoti tahrirda yo'qolmaydi", () => {
    const { db } = setup();
    const s = db.students.find((x) => x.name === "Madina Tursunova")!;
    const i = db.students.indexOf(s);
    db.students[i] = { ...s, photo: "https://x/files/" + "a".repeat(32), consentAt: 5, consentBy: "u_parent" };
    const admin = db.users.find((u) => u.id === "u_adm")!;
    const p = executeCommand(db, admin, "student.save", { id: s.id, name: "Madina T.", classId: s.classId, parents: [] }, NOW);
    expect(p.upsert!.students![0]).toMatchObject({ photo: "https://x/files/" + "a".repeat(32), consentAt: 5, consentBy: "u_parent" });
  });
});

describe("Z_AMS dars natijasi", () => {
  it("dars vaqti bo'yicha topiladi, keldi/kelmadi yoziladi, o'qituvchi belgisi ustun", () => {
    const { db, inst } = setup();
    const kids = db.students.filter((s) => s.classId === "c_5a");
    applyPatch(db, zamsRosterPatch(db, inst(), 7, { students: kids.map((k, i) => ({ id: i + 1, name: k.name, className: "5-A" })) }, NOW).patch);
    const lesson = db.lessons.filter((l) => l.classId === "c_5a" && l.weekday === isoWeekday(TODAY)).sort((a, b) => a.start.localeCompare(b.start))[0];
    db.attendance = db.attendance.filter((a) => !(a.lessonId === lesson.id && a.day === TODAY));   // namunaviy davomatni tozalash
    // o'qituvchi 3-o'quvchini o'zi belgilagan
    db.attendance.push({ id: "a_t", studentId: kids[2].id, lessonId: lesson.id, day: TODAY, status: "present", source: "manual", markedAt: NOW, markedBy: lesson.teacherId });

    const { patch, result } = zamsLessonPatch(db, inst(), 7, {
      day: TODAY, start: lesson.start, lessonNo: 1,
      classes: [{ className: "5a", present: [1, 2], absent: [3, 4] }, { className: "10-Z", present: [1], absent: [] }],
    }, NOW, TODAY);
    applyPatch(db, patch);
    expect(result.classes[0]).toMatchObject({ lessonId: lesson.id, applied: 3, skipped: 1 });
    expect(result.classes[1].reason).toBe("noClass");
    expect(findAttendance(db.attendance, kids[0].id, lesson.id, TODAY)?.status).toBe("present");
    expect(findAttendance(db.attendance, kids[3].id, lesson.id, TODAY)?.status).toBe("absent");
    expect(findAttendance(db.attendance, kids[2].id, lesson.id, TODAY)?.source).toBe("manual");   // o'zgarmadi
    expect(db.notifications.some((n) => kids[3].parentIds.includes(n.userId))).toBe(true);
  });

  it("dars topilmasa yoki sana eski bo'lsa", () => {
    const { db, inst } = setup();
    expect(zamsLessonPatch(db, inst(), 7, { day: TODAY, start: "03:00", classes: [{ className: "5-A", present: [1], absent: [] }] }, NOW, TODAY).result.classes[0].reason).toBe("noLesson");
    expect(() => zamsLessonPatch(db, inst(), 7, { day: "2026-01-01", start: "08:30", classes: [] }, NOW, TODAY)).toThrow("err.zamsDayRange");
  });
});

describe("Z_AMS rozilik", () => {
  it("faqat Z_AMS orqali kelgan o'quvchi belgilanadi", () => {
    expect(isZamsLinked({ externalId: "zams:7:15" })).toBe(true);
    expect(isZamsLinked({ externalId: "boshqa:1" })).toBe(false);
    expect(isZamsLinked({})).toBe(false);
  });
});
