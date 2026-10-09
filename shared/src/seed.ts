import { arrivalStatus } from "./attendance";
import { addDays, atTime, dayKey, hm, isoWeekday, monthKey } from "./dates";
import { notifyAttendance, notifyGrade, notifyHomework, notifyPayment, type NotificationDraft } from "./notify";
import {
  DEFAULT_SETTINGS,
  emptyDatabase,
  type AttendanceStatus,
  type Database,
  type GradeType,
  type Invoice,
  type Lesson,
  type PaymentMethod,
} from "./types";

export const DEMO_OTP = "1111";

export const DEMO_ACCOUNTS: { phone: string; label: string }[] = [
  { phone: "998905555555", label: "demo.parent" },
  { phone: "998903333333", label: "demo.teacher" },
  { phone: "998904444444", label: "demo.student" },
  { phone: "998901111111", label: "demo.director" },
  { phone: "998902222222", label: "demo.directorCenter" },
  { phone: "998900000000", label: "demo.superAdmin" },
];

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** O'quv yili choraklari (taxminiy sanalar, sozlamalarda o'zgartiriladi). */
export function schoolYearTerms(now: number, institutionId: string) {
  const d = new Date(now);
  const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  return [
    { id: `${institutionId}_t1`, institutionId, name: "1-chorak", startDay: `${y}-09-02`, endDay: `${y}-11-01` },
    { id: `${institutionId}_t2`, institutionId, name: "2-chorak", startDay: `${y}-11-10`, endDay: `${y}-12-27` },
    { id: `${institutionId}_t3`, institutionId, name: "3-chorak", startDay: `${y + 1}-01-12`, endDay: `${y + 1}-03-20` },
    { id: `${institutionId}_t4`, institutionId, name: "4-chorak", startDay: `${y + 1}-03-30`, endDay: `${y + 1}-05-25` },
  ];
}

/** Bugungi kunga nisbatan demo ma'lumotlar (deterministik). */
export function seedDatabase(now: number): Database {
  const rnd = mulberry32(7);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const db = emptyDatabase();
  const id = (p: string) => `${p}${db.seq++}`;
  const today = dayKey(now);
  const notify = (userId: string, d: NotificationDraft, time: number, read = false) =>
    db.notifications.push({ id: id("n"), userId, ...d, time, read });

  db.institutions.push(
    { id: "inst_school", name: "Kelajak xususiy maktabi", type: "school", city: "Toshkent, Yunusobod", active: true, createdAt: new Date(2026, 7, 1).getTime(), settings: { ...DEFAULT_SETTINGS } },
    { id: "inst_center", name: "Bilim o'quv markazi", type: "center", city: "Toshkent, Chilonzor", active: true, createdAt: new Date(2026, 7, 15).getTime(), settings: { ...DEFAULT_SETTINGS, paymentDueDay: 5 } },
    { id: "inst_demo3", name: "Zukko akademiyasi", type: "center", city: "Samarqand", active: false, createdAt: new Date(2026, 8, 5).getTime(), settings: { ...DEFAULT_SETTINGS } },
  );
  for (const inst of ["inst_school", "inst_center"]) db.terms.push(...schoolYearTerms(now, inst));

  const user = (u: Partial<(typeof db.users)[number]> & Pick<(typeof db.users)[number], "id" | "name" | "phone" | "role">) =>
    db.users.push({ subjects: [], childIds: [], active: true, ...u });
  user({ id: "u_super", name: "Alisher (super admin)", phone: "998900000000", role: "superAdmin" });
  user({ id: "u_dir", name: "Nodira Yusupova", phone: "998901111111", role: "director", institutionId: "inst_school" });
  user({ id: "u_dir2", name: "Bekzod Aliyev", phone: "998902222222", role: "director", institutionId: "inst_center" });
  user({ id: "u_parent", name: "Feruza Karimova", phone: "998905555555", role: "parent", institutionId: "inst_school", childIds: ["s_a0", "s_b0"] });

  const teachers: [string, string, string, string[]][] = [
    ["t_math", "Dilnoza Karimova", "998903333333", ["Matematika"]],
    ["t_uzb", "Gulnora Rahimova", "998906666661", ["Ona tili", "Adabiyot"]],
    ["t_eng", "Jasur Toshmatov", "998906666662", ["Ingliz tili"]],
    ["t_phys", "Rustam Nazarov", "998906666663", ["Fizika"]],
    ["t_hist", "Malika Ergasheva", "998906666664", ["Tarix"]],
    ["t_it", "Sardor Qodirov", "998906666665", ["Informatika"]],
  ];
  for (const [tid, name, phone, subjects] of teachers) user({ id: tid, name, phone, role: "teacher", institutionId: "inst_school", subjects });
  user({ id: "t_ielts", name: "Kamola Saidova", phone: "998907777771", role: "teacher", institutionId: "inst_center", subjects: ["IELTS"] });
  user({ id: "t_sat", name: "Otabek Mirzayev", phone: "998907777772", role: "teacher", institutionId: "inst_center", subjects: ["SAT Math"] });

  db.classes.push(
    { id: "c_5a", institutionId: "inst_school", name: "5-A", homeroomTeacherId: "t_uzb", monthlyFee: 3_500_000 },
    { id: "c_7b", institutionId: "inst_school", name: "7-B", homeroomTeacherId: "t_math", monthlyFee: 3_500_000 },
    { id: "c_ielts", institutionId: "inst_center", name: "IELTS B2 (kechki)", homeroomTeacherId: "t_ielts", monthlyFee: 900_000 },
  );

  const roster: [string, string, string, string[]][] = [
    ["c_5a", "inst_school", "s_a", ["Aziz Karimov", "Madina Tursunova", "Sherzod Olimov", "Zarina Abdullayeva", "Javohir Rashidov", "Sevara Qosimova", "Bobur Hakimov", "Nilufar Saidova"]],
    ["c_7b", "inst_school", "s_b", ["Kamila Karimova", "Doniyor Ismoilov", "Laylo Yoqubova", "Temur Salimov", "Mohira Jo'rayeva", "Ulugbek Nurmatov", "Shahzoda Fayzullayeva", "Otabek Usmonov"]],
    ["c_ielts", "inst_center", "s_c", ["Diyora Xolmatova", "Islom Sobirov", "Farangiz Mahmudova", "Sanjar Ibragimov", "Ruxshona Alimova", "Akmal Yusupov"]],
  ];
  let phoneSeq = 0;
  for (const [classId, inst, prefix, names] of roster) {
    names.forEach((name, i) => {
      const sid = `${prefix}${i}`;
      const parentIds: string[] = [];
      if (sid === "s_a0" || sid === "s_b0") parentIds.push("u_parent");
      else {
        const pid = `p_${sid}`;
        parentIds.push(pid);
        user({ id: pid, name: `${name.split(" ")[1]} (ota-ona)`, phone: `9989911${String(10000 + ++phoneSeq * 37).slice(-5)}`, role: "parent", institutionId: inst, childIds: [sid] });
      }
      const consent = sid === "s_a0" || sid === "s_b0" || rnd() < 0.85;
      db.students.push({ id: sid, institutionId: inst, name, classId, parentIds, archived: false, parentConsent: consent, faceTemplates: [] });
    });
  }
  // Demo o'quvchi akkaunti: Kamila
  user({ id: "u_student", name: "Kamila Karimova", phone: "998904444444", role: "student", institutionId: "inst_school", studentId: "s_b0" });
  db.students.find((s) => s.id === "s_b0")!.userId = "u_student";

  // Dars jadvali
  const slots: [string, string][] = [["08:30", "09:15"], ["09:25", "10:10"], ["10:20", "11:05"], ["11:20", "12:05"], ["12:15", "13:00"]];
  const teacherBySubject: Record<string, string> = {
    Matematika: "t_math", "Ona tili": "t_uzb", Adabiyot: "t_uzb", "Ingliz tili": "t_eng", Fizika: "t_phys", Tarix: "t_hist", Informatika: "t_it",
  };
  const plans: Record<string, Record<number, string[]>> = {
    c_5a: {
      1: ["Matematika", "Ona tili", "Ingliz tili", "Tarix"],
      2: ["Ona tili", "Matematika", "Informatika", "Ingliz tili"],
      3: ["Matematika", "Tarix", "Adabiyot", "Ingliz tili"],
      4: ["Ingliz tili", "Matematika", "Ona tili", "Informatika"],
      5: ["Matematika", "Adabiyot", "Tarix", "Ingliz tili"],
      6: ["Informatika", "Matematika", "Ona tili"],
    },
    c_7b: {
      1: ["Fizika", "Matematika", "Ingliz tili", "Ona tili", "Tarix"],
      2: ["Matematika", "Fizika", "Adabiyot", "Informatika"],
      3: ["Ingliz tili", "Matematika", "Fizika", "Tarix", "Ona tili"],
      4: ["Matematika", "Ona tili", "Informatika", "Fizika"],
      5: ["Fizika", "Ingliz tili", "Matematika", "Tarix"],
      6: ["Matematika", "Informatika", "Ingliz tili"],
    },
  };
  const roomPrefix: Record<string, string> = { c_5a: "20", c_7b: "30" };
  for (const [classId, plan] of Object.entries(plans)) {
    for (const [day, subjects] of Object.entries(plan)) {
      subjects.forEach((subject, i) => {
        db.lessons.push({
          id: id("l"), classId, subject, teacherId: teacherBySubject[subject], weekday: Number(day),
          start: slots[i][0], end: slots[i][1], room: `${roomPrefix[classId]}${(i % 3) + 1}`,
        });
      });
    }
  }
  for (const d of [1, 3, 5]) db.lessons.push({ id: id("l"), classId: "c_ielts", subject: "IELTS", teacherId: "t_ielts", weekday: d, start: "17:00", end: "18:30", room: "B-4" });
  for (const d of [2, 4]) db.lessons.push({ id: id("l"), classId: "c_ielts", subject: "SAT Math", teacherId: "t_sat", weekday: d, start: "17:00", end: "18:30", room: "B-2" });

  const lessonsOn = (classId: string, wd: number): Lesson[] =>
    db.lessons.filter((l) => l.classId === classId && l.weekday === wd).sort((a, b) => a.start.localeCompare(b.start));
  const studentsOf = (classId: string) => db.students.filter((s) => s.classId === classId);

  // O'tgan 3 hafta: dars bo'yicha davomat va baholar.
  const comments = ["Faol qatnashdi", "Uy vazifasi to'liq emas", "Yaxshi javob berdi", undefined, undefined, undefined, undefined];
  for (let back = 21; back >= 1; back--) {
    const day = addDays(today, -back);
    const wd = isoWeekday(day);
    if (wd === 7) continue;
    for (const c of db.classes) {
      const dl = lessonsOn(c.id, wd);
      if (dl.length === 0) continue;
      for (const s of studentsOf(c.id)) {
        const r = rnd();
        const dayStatus: AttendanceStatus = r < 0.86 ? "present" : r < 0.93 ? "late" : r < 0.97 ? "absent" : "excused";
        dl.forEach((l, i) => {
          let status: AttendanceStatus = dayStatus === "late" ? (i === 0 ? "late" : "present") : dayStatus;
          if (status === "present" && i === dl.length - 1 && rnd() < 0.03) status = "absent"; // oxirgi darsdan ketib qolgan
          const markedAt = atTime(day, l.start) + (status === "late" ? 12 + Math.floor(rnd() * 20) : Math.floor(rnd() * 6)) * 60000;
          db.attendance.push({ id: id("a"), studentId: s.id, lessonId: l.id, day, status, source: "manual", markedAt, markedBy: l.teacherId });
          if (status !== "present" && status !== "late") return;
          if (rnd() > 0.27) return;
          const base = s.id.endsWith("0") ? 4.4 : 3.9;
          const type: GradeType = rnd() < 0.12 ? "control" : rnd() < 0.3 ? "oral" : rnd() < 0.2 ? "written" : "current";
          const v = Math.min(5, Math.max(2, Math.round(base + (rnd() * 2 - 1.1))));
          db.grades.push({ id: id("g"), studentId: s.id, subject: l.subject, value: v, type, day, createdAt: atTime(day, l.end), teacherId: l.teacherId, lessonId: l.id, comment: pick(comments) });
        });
      }
    }
  }

  // Bugun: 5-A ning birinchi ikki darsi belgilangan, 7-B hali yo'q.
  if (isoWeekday(today) !== 7) {
    const dl = lessonsOn("c_5a", isoWeekday(today)).slice(0, 2);
    for (const l of dl) {
      if (atTime(today, l.start) > now) continue;
      for (const s of studentsOf("c_5a")) {
        const status: AttendanceStatus = s.id === "s_a5" ? "absent" : arrivalStatus(l, today, atTime(today, l.start) + (s.id === "s_a3" && l === dl[0] ? 15 : 3) * 60000, 10);
        db.attendance.push({ id: id("a"), studentId: s.id, lessonId: l.id, day: today, status, source: "manual", markedAt: atTime(today, l.start) + 4 * 60000, markedBy: l.teacherId });
      }
    }
  }

  // Uy vazifalari
  const hw = (classId: string, subject: string, title: string, description: string, dueIn: number, createdAgo: number) => {
    const h = {
      id: id("h"), classId, subject, teacherId: teacherBySubject[subject] ?? "t_ielts", title, description,
      dueDay: addDays(today, dueIn), createdAt: atTime(addDays(today, -createdAgo), "14:00"), attachments: [],
    };
    db.homeworks.push(h);
    return h;
  };
  hw("c_5a", "Matematika", "Kasrlarni qo'shish", "Darslik 45-bet, 1-10 misollar.", 1, 1);
  hw("c_5a", "Ona tili", "Insho: \"Mening oilam\"", "Kamida 1 bet, chiroyli yozuvda.", 3, 2);
  hw("c_5a", "Ingliz tili", "Unit 3 so'zlari", "20 ta yangi so'zni yodlash, har biriga gap tuzish.", 2, 1);
  const hist = hw("c_5a", "Tarix", "Amir Temur davri", "12-mavzuni o'qib, 5 ta savolga javob yozish.", -2, 6);
  const lin = hw("c_7b", "Matematika", "Chiziqli tenglamalar", "Darslik 78-bet, 4-15 misollar. Yechimni rasmga olib yuboring.", 1, 0);
  hw("c_7b", "Fizika", "Tezlik va tezlanish", "Laboratoriya ishi hisobotini tayyorlash.", 4, 2);
  const scratch = hw("c_7b", "Informatika", "Scratch loyihasi", "Oddiy o'yin yaratib, faylini yuborish.", 6, 3);
  const prevMath = hw("c_7b", "Matematika", "Kasr tenglamalar", "Mustaqil ish varag'i, 1-8.", -3, 7);
  hw("c_ielts", "IELTS", "Writing Task 2", "Opinion essay, 250+ words: \"Technology in education\".", 2, 1);

  // Topshiriqlar
  const sub = (homeworkId: string, studentId: string, text: string, agoH: number, checked?: { grade?: number; feedback?: string }) =>
    db.submissions.push({
      id: id("sub"), homeworkId, studentId, text, attachments: [], submittedAt: now - agoH * 3600000,
      status: checked ? "checked" : "submitted", grade: checked?.grade, feedback: checked?.feedback, checkedAt: checked ? now - (agoH - 2) * 3600000 : undefined,
    });
  sub(hist.id, "s_a1", "1) 1336-yil ... 5) Samarqand.", 80, { grade: 5, feedback: "Juda yaxshi" });
  sub(hist.id, "s_a0", "Javoblar daftarda, rasm ilova qilindi.", 76, { grade: 4, feedback: "3-savolga to'liqroq javob kerak" });
  sub(prevMath.id, "s_b0", "Hammasi yechildi, 6-misolda shubham bor.", 90, { grade: 5 });
  sub(prevMath.id, "s_b2", "1-7 yechildi.", 88);
  sub(lin.id, "s_b1", "4-15 yechildi.", 2);
  sub(scratch.id, "s_b3", "Loyiha havolasi: scratch.mit.edu/projects/...", 20);

  // To'lovlar: oxirgi 3 oy.
  const nowDate = new Date(now);
  const methods: PaymentMethod[] = ["cash", "card", "click", "payme"];
  for (const s of db.students) {
    const cls = db.classes.find((c) => c.id === s.classId)!;
    const settings = db.institutions.find((i) => i.id === s.institutionId)!.settings;
    for (let m = 2; m >= 0; m--) {
      const first = new Date(nowDate.getFullYear(), nowDate.getMonth() - m, 1);
      const inv: Invoice = {
        id: id("inv"), studentId: s.id, month: monthKey(first), amount: cls.monthlyFee,
        dueDay: dayKey(new Date(first.getFullYear(), first.getMonth(), settings.paymentDueDay)), payments: [],
      };
      const r = rnd();
      if (m === 2 || (m === 1 && r < 0.9) || (m === 0 && r < 0.45)) {
        inv.payments.push({ id: id("p"), amount: inv.amount, date: new Date(first.getFullYear(), first.getMonth(), 3 + Math.floor(rnd() * 6)).getTime(), method: pick(methods), recordedBy: "u_dir" });
      } else if (m === 0 && r < 0.7) {
        inv.payments.push({ id: id("p"), amount: inv.amount / 2, date: new Date(first.getFullYear(), first.getMonth(), 5).getTime(), method: "cash", recordedBy: "u_dir" });
      }
      db.invoices.push(inv);
    }
  }
  for (const inv of db.invoices) if (inv.studentId === "s_b0" && inv.month === monthKey(nowDate)) inv.payments = [];

  // Yozishma
  const th = { id: "th_1", institutionId: "inst_school", studentId: "s_b0", parentId: "u_parent", teacherId: "t_math", lastMessageAt: now - 26 * 3600000 };
  db.threads.push(th);
  db.messages.push(
    { id: id("m"), threadId: th.id, senderId: "u_parent", text: "Assalomu alaykum. Kamila nazorat ishiga qachon tayyorlanishi kerak?", time: now - 28 * 3600000, readBy: ["u_parent", "t_math"] },
    { id: id("m"), threadId: th.id, senderId: "t_math", text: "Va alaykum assalom. Keyingi chorshanba kuni, 4-6 mavzular bo'yicha.", time: now - 26 * 3600000, readBy: ["t_math"] },
  );

  // Ota-ona bildirishnomalari
  notify("u_parent", notifyGrade({ student: "Kamila Karimova", subject: "Matematika", value: 5, typeKey: "grade.type.control", comment: "Faol qatnashdi" }), now - 20 * 3600000);
  notify("u_parent", notifyHomework({ student: "Kamila Karimova", subject: "Matematika", title: "Chiziqli tenglamalar", due: addDays(today, 1) }), now - 3 * 3600000);
  notify("u_parent", notifyPayment({ student: "Aziz Karimov", month: monthKey(nowDate), amount: 1_750_000, remaining: 1_750_000, method: "cash" }), now - 2 * 86400000, true);
  const aziz5a = db.attendance.find((a) => a.studentId === "s_a0" && a.day === today);
  if (aziz5a) {
    notify("u_parent", notifyAttendance({ student: "Aziz Karimov", subject: db.lessons.find((l) => l.id === aziz5a.lessonId)!.subject, time: hm(aziz5a.markedAt), status: aziz5a.status, viaFace: false, studentId: "s_a0" }), aziz5a.markedAt);
  }
  return db;
}
