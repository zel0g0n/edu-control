// Buyruqlarni bajaruvchi yagona "server" mantig'i: demo rejimda brauzerda,
// NestJS backendda esa serverda ishlaydi. Natija har doim Patch.
import { isPresent } from "./attendance";
import { findConflicts, validTimeRange } from "./schedule";
import { dayKey, hm } from "./dates";
import { invoiceRemaining } from "./billing";
import { buildInvoices } from "./tuition";
import { holidayDays } from "./holidays";
import { branchLimit, guardBranchPatch } from "./branches";
import { parseCommandInput } from "./validation";
import { isValidGrade } from "./grades";
import { newId } from "./ids";
import { formatReceiptId, newReceiptId, usedReceiptIds } from "./receipt";
import { makeStudentLogin, phoneProfiles, phoneTaken, usedLogins } from "./credentials";
import { classIdsOf, gradesEnabled, inClass, notifyTargets, updateEnrollments } from "./membership";
import {
  notifyAnnouncement, notifyAttendance, notifyDebt, notifyGrade, notifyHomework, notifyMessage, notifyPayment,
  notifySubmissionChecked, notifySubmissionNew, type NotificationDraft,
} from "./notify";
import { CommandError, type Patch } from "./patch";
import { canManageInstitution, canTeachLesson, normalizePhone, teachesSubjectInClass } from "./permissions";
import { DEMO_OTP } from "./seed";
import type { CommandMap, CommandName } from "./commands";
import {
  DEFAULT_SETTINGS,
  type AppNotification, type AppUser, type Database, type Lead, type Lesson, type SchoolClass, type Student, type Thread,
} from "./types";
import { findAttendance } from "./lookup";

interface Ctx {
  db: Database;
  actor: AppUser;
  now: number;
}

const deny = () => {
  throw new CommandError("err.forbidden", {}, 403);
};
const notFound = () => {
  throw new CommandError("err.notFound", {}, 404);
};
/** Qarz eslatmasi oralig'i. */
export const REMIND_GAP = 20 * 3_600_000;
const must = <T>(v: T | undefined | null): T => (v ?? notFound()) as T;

function instOf(ctx: Ctx): string {
  return ctx.actor.institutionId ?? deny();
}

/** O'zgartirish huquqi: administrator (direktor faqat ko'radi). */
function requireManager(ctx: Ctx, institutionId?: string) {
  if (!canManageInstitution(ctx.actor, institutionId ?? ctx.actor.institutionId ?? "")) deny();
}

function notifications(ctx: Ctx, userIds: Iterable<string>, d: NotificationDraft): AppNotification[] {
  return [...new Set(userIds)].map((userId) => ({ id: newId("n"), userId, ...d, time: ctx.now, read: false }));
}

/** Ota-onalar; katta yoshli o'quvchida o'zi. */
function studentParents(s: Student) {
  return notifyTargets(s);
}

/** Baho tizimi o'chirilgan muassasada baho qo'yilmaydi. */
function requireGrades(ctx: Ctx, institutionId: string) {
  const inst = ctx.db.institutions.find((i) => i.id === institutionId);
  if (!gradesEnabled(inst?.settings)) throw new CommandError("err.gradesDisabled");
}

const MAX_ATTACHMENT = 2 * 1024 * 1024;
function checkAttachments(list: { size: number }[]) {
  if (list.length > 5) throw new CommandError("err.tooManyFiles");
  if (list.some((a) => a.size > MAX_ATTACHMENT)) throw new CommandError("err.fileTooLarge", { mb: 2 });
}

/** Telefon bo'yicha foydalanuvchini topadi yoki yaratadi (ota-ona/o'quvchi/o'qituvchi). */
function upsertPerson(ctx: Ctx, input: { name: string; phone: string }, role: AppUser["role"], extra: Partial<AppUser>): AppUser {
  const phone = normalizePhone(input.phone);
  if (!phone) throw new CommandError("err.phone", { phone: input.phone });
  // Shu muassasada shu rolda bo'lsa o'sha profil (masalan, aka-uka bolalarning ota-onasi).
  // Boshqa rolda (o'qituvchi farzandi shu maktabda) yoki boshqa muassasada: alohida profil.
  const existing = ctx.db.users.find((u) => u.phone === phone && u.role === role && u.institutionId === extra.institutionId);
  if (existing) return { ...existing, name: input.name.trim() || existing.name, active: true };
  if (phoneTaken(ctx.db, phone, role, extra.institutionId)) throw new CommandError("err.phoneTaken", { phone: input.phone });
  return { id: newId("u"), name: input.name.trim(), phone, role, subjects: [], childIds: [], active: true, ...extra };
}

type Handler<K extends CommandName> = (ctx: Ctx, input: CommandMap[K]) => Patch;

const handlers: { [K in CommandName]: Handler<K> } = {
  "attendance.mark"(ctx, { lessonId, day, marks }) {
    const lesson = must(ctx.db.lessons.find((l) => l.id === lessonId));
    const cls = must(ctx.db.classes.find((c) => c.id === lesson.classId));
    if (!canTeachLesson(ctx.actor, lesson, cls)) deny();
    const attendance = [];
    const notes: AppNotification[] = [];
    for (const m of marks) {
      const s = must(ctx.db.students.find((x) => x.id === m.studentId && inClass(x, cls.id)));
      const prev = findAttendance(ctx.db.attendance, s.id, lessonId, day);
      const rec = {
        id: prev?.id ?? newId("a"), studentId: s.id, lessonId, day, status: m.status, source: m.source,
        markedAt: ctx.now, markedBy: ctx.actor.id, snapshot: isPresent(m.status) ? (m.snapshot ?? prev?.snapshot) : undefined, matchScore: m.score,
      };
      attendance.push(rec);
      if (prev?.status === m.status) continue;
      notes.push(...notifications(ctx, studentParents(s), notifyAttendance({
        student: s.name, subject: lesson.subject, time: hm(ctx.now), status: m.status, viaFace: m.source === "face", snapshot: rec.snapshot, studentId: s.id,
      })));
    }
    return { upsert: { attendance, notifications: notes } };
  },

  "grade.add"(ctx, p) {
    if (!isValidGrade(p.value)) throw new CommandError("err.grade");
    const s = must(ctx.db.students.find((x) => x.id === p.studentId));
    requireGrades(ctx, s.institutionId);
    const allowed = ctx.actor.role === "admin" ? ctx.actor.institutionId === s.institutionId : classIdsOf(s).some((c) => teachesSubjectInClass(ctx.actor, ctx.db.lessons, c, p.subject));
    if (!allowed) deny();
    const grade = { id: newId("g"), studentId: s.id, subject: p.subject, value: p.value, type: p.type, day: p.day, createdAt: ctx.now, teacherId: ctx.actor.id, lessonId: p.lessonId, comment: p.comment?.trim() || undefined };
    return {
      upsert: {
        grades: [grade],
        notifications: notifications(ctx, studentParents(s), notifyGrade({ student: s.name, subject: p.subject, value: p.value, typeKey: `grade.type.${p.type}`, comment: grade.comment })),
      },
    };
  },

  "grade.remove"(ctx, { id }) {
    const g = must(ctx.db.grades.find((x) => x.id === id));
    if (g.teacherId !== ctx.actor.id && ctx.actor.role !== "admin") deny();
    return { remove: { grades: [id] } };
  },

  "grade.setFinal"(ctx, p) {
    const s = must(ctx.db.students.find((x) => x.id === p.studentId));
    requireGrades(ctx, s.institutionId);
    const allowed = ctx.actor.role === "admin" ? ctx.actor.institutionId === s.institutionId : classIdsOf(s).some((c) => teachesSubjectInClass(ctx.actor, ctx.db.lessons, c, p.subject));
    if (!allowed) deny();
    const term = must(ctx.db.terms.find((t) => t.id === p.termId));
    const prev = ctx.db.grades.find((g) => g.studentId === s.id && g.subject === p.subject && g.type === p.type && g.termId === p.termId);
    if (p.value === null) return prev ? { remove: { grades: [prev.id] } } : {};
    if (!isValidGrade(p.value)) throw new CommandError("err.grade");
    const grade = { id: prev?.id ?? newId("g"), studentId: s.id, subject: p.subject, value: p.value, type: p.type, day: term.endDay, createdAt: ctx.now, teacherId: ctx.actor.id, termId: term.id };
    return {
      upsert: {
        grades: [grade],
        notifications: prev?.value === p.value ? [] : notifications(ctx, studentParents(s), notifyGrade({ student: s.name, subject: p.subject, value: p.value, typeKey: `grade.type.${p.type}` })),
      },
    };
  },

  "homework.save"(ctx, p) {
    const cls = must(ctx.db.classes.find((c) => c.id === p.classId));
    const allowed = ctx.actor.role === "admin" ? ctx.actor.institutionId === cls.institutionId : teachesSubjectInClass(ctx.actor, ctx.db.lessons, cls.id, p.subject);
    if (!allowed) deny();
    if (!p.title.trim()) throw new CommandError("err.required", { field: "Mavzu" });
    checkAttachments(p.attachments);
    const prev = p.id ? must(ctx.db.homeworks.find((h) => h.id === p.id)) : undefined;
    const hw = {
      id: prev?.id ?? newId("h"), classId: cls.id, subject: p.subject, teacherId: prev?.teacherId ?? ctx.actor.id, title: p.title.trim(),
      description: p.description.trim(), dueDay: p.dueDay, createdAt: prev?.createdAt ?? ctx.now, attachments: p.attachments,
    };
    const students = ctx.db.students.filter((s) => inClass(s, cls.id) && !s.archived);
    const notes = prev ? [] : students.flatMap((s) =>
      notifications(ctx, [...s.parentIds, ...(s.userId ? [s.userId] : [])], notifyHomework({ student: s.name, subject: hw.subject, title: hw.title, due: hw.dueDay })));
    return { upsert: { homeworks: [hw], notifications: notes } };
  },

  "homework.delete"(ctx, { id }) {
    const h = must(ctx.db.homeworks.find((x) => x.id === id));
    if (h.teacherId !== ctx.actor.id && ctx.actor.role !== "admin") deny();
    return { remove: { homeworks: [id], submissions: ctx.db.submissions.filter((s) => s.homeworkId === id).map((s) => s.id) } };
  },

  "submission.submit"(ctx, p) {
    if (ctx.actor.role !== "student" || !ctx.actor.studentId) deny();
    const s = must(ctx.db.students.find((x) => x.id === ctx.actor.studentId));
    const h = must(ctx.db.homeworks.find((x) => x.id === p.homeworkId && inClass(s, x.classId)));
    if (!p.text.trim() && p.attachments.length === 0) throw new CommandError("err.emptySubmission");
    checkAttachments(p.attachments);
    const prev = ctx.db.submissions.find((x) => x.homeworkId === h.id && x.studentId === s.id);
    if (prev?.status === "checked") throw new CommandError("err.alreadyChecked");
    const sub = { id: prev?.id ?? newId("sub"), homeworkId: h.id, studentId: s.id, text: p.text.trim(), attachments: p.attachments, submittedAt: ctx.now, status: "submitted" as const };
    return { upsert: { submissions: [sub], notifications: notifications(ctx, [h.teacherId], notifySubmissionNew({ student: s.name, title: h.title })) } };
  },

  "submission.review"(ctx, p) {
    const sub = must(ctx.db.submissions.find((x) => x.id === p.id));
    const h = must(ctx.db.homeworks.find((x) => x.id === sub.homeworkId));
    if (h.teacherId !== ctx.actor.id && ctx.actor.role !== "admin") deny();
    if (p.grade !== undefined && !isValidGrade(p.grade)) throw new CommandError("err.grade");
    const s = must(ctx.db.students.find((x) => x.id === sub.studentId));
    const next = { ...sub, status: p.status, grade: p.grade, feedback: p.feedback?.trim() || undefined, checkedAt: ctx.now };
    const recipients = [...s.parentIds, ...(s.userId ? [s.userId] : [])];
    const upsert: Patch["upsert"] = { submissions: [next], notifications: notifications(ctx, recipients, notifySubmissionChecked({ student: s.name, title: h.title, grade: p.grade })) };
    if (p.grade !== undefined && p.status === "checked") {
      upsert.grades = [{ id: `g_${sub.id}`, studentId: s.id, subject: h.subject, value: p.grade, type: "written", day: h.dueDay, createdAt: ctx.now, teacherId: ctx.actor.id, comment: `Uy vazifasi: ${h.title}` }];
    }
    return { upsert };
  },

  "invoice.generate"(ctx, { month }) {
    requireManager(ctx);
    const inst = must(ctx.db.institutions.find((i) => i.id === instOf(ctx)));
    // Filial administratori faqat o'z filiali o'quvchilariga yaratadi
    const limit = branchLimit(ctx.db, ctx.actor);
    const students = ctx.db.students.filter((s) => s.institutionId === inst.id && (!limit || limit.studentOk(s)));
    const classes = ctx.db.classes.filter((c) => c.institutionId === inst.id);
    const classIds = new Set(classes.map((c) => c.id));
    // Guruh to'lov turi, oy o'rtasida qo'shilish va qoldirilgan darslar hisobga olinadi
    const created = buildInvoices(month, students, ctx.db.invoices, inst.settings.paymentDueDay, {
      classes, lessons: ctx.db.lessons.filter((l) => classIds.has(l.classId)), attendance: ctx.db.attendance, holidays: holidayDays(inst.settings),
    }).map((i) => ({ ...i, id: newId("inv") }));
    return { upsert: { invoices: created } };
  },

  "payment.remind"(ctx, p) {
    requireManager(ctx);
    const inst = instOf(ctx);
    const limit = branchLimit(ctx.db, ctx.actor);
    const students = new Map(ctx.db.students.filter((s) => s.institutionId === inst && !s.archived && (!limit || limit.studentOk(s))).map((s) => [s.id, s]));
    const ids = p.invoiceIds ? new Set(p.invoiceIds) : null;
    // Bir hisob-varaqqa sutkada bir martadan ko'p eslatilmaydi
    const fresh = ctx.now - REMIND_GAP;
    const due = ctx.db.invoices.filter((i) => students.has(i.studentId) && invoiceRemaining(i) > 0
      && (ids ? ids.has(i.id) : !p.month || i.month === p.month) && !(i.remindedAt && i.remindedAt > fresh));
    if (!due.length) throw new CommandError("err.remindNone");
    const notes: AppNotification[] = [];
    for (const inv of due) {
      const s = students.get(inv.studentId)!;
      for (const userId of new Set(studentParents(s))) {
        notes.push({ id: newId("n"), userId, time: ctx.now, read: false, ...notifyDebt({
          student: s.name, month: inv.month, remaining: invoiceRemaining(inv), receipt: formatReceiptId(s.receiptId), forStudent: userId === s.userId,
        }) });
      }
    }
    return { upsert: { invoices: due.map((i) => ({ ...i, remindedAt: ctx.now })), notifications: notes } };
  },

  "invoice.adjust"(ctx, p) {
    const inv = must(ctx.db.invoices.find((i) => i.id === p.id));
    const s = must(ctx.db.students.find((x) => x.id === inv.studentId));
    requireManager(ctx, s.institutionId);
    if (!(p.amount >= 0)) throw new CommandError("err.amount");
    return { upsert: { invoices: [{ ...inv, amount: Math.round(p.amount), note: p.note?.trim() || undefined }] } };
  },

  "payment.add"(ctx, p) {
    const inv = must(ctx.db.invoices.find((i) => i.id === p.invoiceId));
    const s = must(ctx.db.students.find((x) => x.id === inv.studentId));
    requireManager(ctx, s.institutionId);
    const remaining = invoiceRemaining(inv);
    if (!(p.amount > 0) || p.amount > remaining) throw new CommandError("err.amountRange", { max: remaining });
    const next = { ...inv, payments: [...inv.payments, { id: newId("p"), amount: Math.round(p.amount), date: ctx.now, method: p.method, recordedBy: ctx.actor.id }] };
    return {
      upsert: {
        invoices: [next],
        notifications: notifications(ctx, studentParents(s), notifyPayment({ student: s.name, month: inv.month, amount: p.amount, remaining: invoiceRemaining(next), method: p.method })),
      },
    };
  },

  "payment.demoOnline"(ctx, p) {
    const inv = must(ctx.db.invoices.find((i) => i.id === p.invoiceId));
    const s = must(ctx.db.students.find((x) => x.id === inv.studentId));
    if (!((ctx.actor.role === "parent" && ctx.actor.childIds.includes(s.id)) || (s.adult && ctx.actor.studentId === s.id))) deny();
    const amount = invoiceRemaining(inv);
    if (amount <= 0) throw new CommandError("err.alreadyPaid");
    const next = { ...inv, payments: [...inv.payments, { id: newId("p"), amount, date: ctx.now, method: p.provider, recordedBy: ctx.actor.id, externalId: `demo-${Date.now()}` }] };
    return {
      upsert: {
        invoices: [next],
        notifications: notifications(ctx, studentParents(s), notifyPayment({ student: s.name, month: inv.month, amount, remaining: 0, method: p.provider })),
      },
    };
  },

  "message.send"(ctx, p) {
    const text = p.text.trim();
    if (!text) throw new CommandError("err.required", { field: "Xabar" });
    const s = must(ctx.db.students.find((x) => x.id === p.studentId));
    const teacher = must(ctx.db.users.find((u) => u.id === p.teacherId && u.role === "teacher"));
    let parentId: string;
    // Yozishmaning ikkinchi tomoni: ota-ona yoki katta yoshli o'quvchining o'zi
    const selfAccount = s.adult && s.userId ? s.userId : undefined;
    if (ctx.actor.role === "parent") {
      if (!ctx.actor.childIds.includes(s.id)) deny();
      parentId = ctx.actor.id;
    } else if (ctx.actor.role === "student") {
      if (!selfAccount || ctx.actor.id !== selfAccount || ctx.actor.studentId !== s.id) deny();
      parentId = ctx.actor.id;
    } else if (ctx.actor.role === "teacher" && ctx.actor.id === teacher.id) {
      parentId = p.parentId ?? s.parentIds[0] ?? selfAccount ?? deny();
      if (!s.parentIds.includes(parentId) && parentId !== selfAccount) deny();
    } else return deny();
    const teaches = ctx.db.lessons.some((l) => inClass(s, l.classId) && l.teacherId === teacher.id) ||
      ctx.db.classes.some((c) => inClass(s, c.id) && c.homeroomTeacherId === teacher.id);
    if (!teaches) deny();
    const prev = ctx.db.threads.find((t) => t.studentId === s.id && t.teacherId === teacher.id && t.parentId === parentId);
    const thread: Thread = prev ? { ...prev, lastMessageAt: ctx.now } : { id: newId("th"), institutionId: s.institutionId, studentId: s.id, parentId, teacherId: teacher.id, lastMessageAt: ctx.now };
    const msg = { id: newId("m"), threadId: thread.id, senderId: ctx.actor.id, text, time: ctx.now, readBy: [ctx.actor.id] };
    const toParent = ctx.actor.role === "teacher";
    return {
      upsert: {
        threads: [thread],
        messages: [msg],
        notifications: notifications(ctx, [toParent ? parentId : teacher.id], notifyMessage({ from: ctx.actor.name, student: s.name, text, threadId: thread.id, forRole: !toParent ? "teacher" : parentId === selfAccount ? "student" : "parent" })),
      },
    };
  },

  "thread.read"(ctx, { threadId }) {
    const t = must(ctx.db.threads.find((x) => x.id === threadId));
    if (t.parentId !== ctx.actor.id && t.teacherId !== ctx.actor.id) deny();
    const messages = ctx.db.messages.filter((m) => m.threadId === t.id && !m.readBy.includes(ctx.actor.id)).map((m) => ({ ...m, readBy: [...m.readBy, ctx.actor.id] }));
    const notes = ctx.db.notifications.filter((n) => n.userId === ctx.actor.id && !n.read && n.link?.endsWith(`/messages/${t.id}`)).map((n) => ({ ...n, read: true }));
    return { upsert: { messages, notifications: notes } };
  },

  "notification.read"(ctx, { id, all }) {
    const list = ctx.db.notifications.filter((n) => n.userId === ctx.actor.id && !n.read && (all || n.id === id));
    return { upsert: { notifications: list.map((n) => ({ ...n, read: true })) } };
  },

  "announcement.send"(ctx, p) {
    requireManager(ctx);
    if (!p.title.trim() || !p.body.trim()) throw new CommandError("err.required", { field: "Matn" });
    const inst = instOf(ctx);
    const limit = branchLimit(ctx.db, ctx.actor);
    if (limit && p.classId && !limit.classIds.has(p.classId)) throw new CommandError("err.branchForbidden", {}, 403);
    const students = ctx.db.students.filter((s) => s.institutionId === inst && !s.archived && (!p.classId || inClass(s, p.classId)) && (!limit || limit.studentOk(s)));
    const recipients = students.flatMap((s) => [...s.parentIds, ...(s.userId ? [s.userId] : [])]);
    return { upsert: { notifications: notifications(ctx, recipients, notifyAnnouncement({ title: p.title.trim(), body: p.body.trim() })) } };
  },

  "consent.set"(ctx, { studentId, consent }) {
    const s = must(ctx.db.students.find((x) => x.id === studentId));
    if (!(ctx.actor.role === "parent" && ctx.actor.childIds.includes(s.id))) deny();
    return { upsert: { students: [consent ? { ...s, parentConsent: true } : { ...s, parentConsent: false, faceTemplates: [], facePhoto: undefined, faceModel: undefined }] } };
  },

  "face.enroll"(ctx, { studentId, templates, photo, model }) {
    const s = must(ctx.db.students.find((x) => x.id === studentId));
    const teaches = ctx.db.lessons.some((l) => inClass(s, l.classId) && l.teacherId === ctx.actor.id) ||
      ctx.db.classes.some((c) => inClass(s, c.id) && c.homeroomTeacherId === ctx.actor.id);
    if (!(teaches || (ctx.actor.role === "admin" && ctx.actor.institutionId === s.institutionId))) deny();
    if (!s.parentConsent) throw new CommandError("err.noConsent");
    // 128..1024 o'lchamli, bir xil uzunlikdagi vektorlar (model web tomonda tanlanadi)
    const len = templates[0]?.length ?? 0;
    if (templates.length === 0 || templates.length > 24 || len < 128 || len > 1024 || templates.some((t) => t.length !== len || t.some((v) => !Number.isFinite(v)))) {
      throw new CommandError("err.faceTemplate");
    }
    const faceModel = typeof model === "string" && /^[a-z0-9.-]{1,40}$/.test(model) ? model : undefined;
    return { upsert: { students: [{ ...s, faceTemplates: templates, facePhoto: photo, faceModel }] } };
  },

  "student.save"(ctx, p) {
    requireManager(ctx);
    const inst = instOf(ctx);
    if (!p.name.trim()) throw new CommandError("err.required", { field: "Ism" });
    const cls = must(ctx.db.classes.find((c) => c.id === p.classId && c.institutionId === inst));
    const prev = p.id ? must(ctx.db.students.find((s) => s.id === p.id && s.institutionId === inst)) : undefined;
    const id = prev?.id ?? newId("s");
    const institution = ctx.db.institutions.find((i) => i.id === inst);
    // Qo'shimcha guruhlar faqat o'quv markazida; har biri shu muassasaniki bo'lishi shart
    const extraClassIds = institution?.type === "center"
      ? [...new Set(p.extraClassIds ?? [])].filter((c) => c !== cls.id).map((c) => must(ctx.db.classes.find((x) => x.id === c && x.institutionId === inst)).id)
      : [];
    const adult = institution?.type === "center" && !!p.adult;
    const users: AppUser[] = [];
    const parentIds: string[] = [];
    for (const person of (adult ? [] : p.parents).filter((x) => x.phone.trim())) {
      const u = upsertPerson(ctx, person, "parent", { institutionId: inst });
      if (!u.childIds.includes(id)) u.childIds = [...u.childIds, id];
      users.push(u);
      parentIds.push(u.id);
    }
    // Olib tashlangan ota-onalardan farzandni uzish.
    for (const pid of prev?.parentIds ?? []) {
      if (parentIds.includes(pid)) continue;
      const u = ctx.db.users.find((x) => x.id === pid);
      if (u) users.push({ ...u, childIds: u.childIds.filter((c) => c !== id) });
    }
    // Har bir o'quvchining o'z akkaunti bor: login ism.familiya (o'zgarmaydi), telefon ixtiyoriy.
    const prevAcc = prev?.userId ? ctx.db.users.find((u) => u.id === prev.userId) : undefined;
    let phone = "";
    if (p.studentPhone?.trim()) {
      phone = normalizePhone(p.studentPhone) ?? "";
      if (!phone) throw new CommandError("err.phone", { phone: p.studentPhone });
      if (phoneTaken(ctx.db, phone, "student", inst, prevAcc?.id)) throw new CommandError("err.phoneTaken", { phone: p.studentPhone });
    }
    const account: AppUser = prevAcc
      ? { ...prevAcc, name: p.name.trim(), phone, studentId: id, login: prevAcc.login || makeStudentLogin(p.name, usedLogins(ctx.db)) }
      : { id: newId("u"), name: p.name.trim(), phone, role: "student", institutionId: inst, subjects: [], childIds: [], studentId: id, login: makeStudentLogin(p.name, usedLogins(ctx.db)), active: true };
    users.push(account);
    const userId = account.id;
    const student: Student = {
      id, institutionId: inst, name: p.name.trim(), classId: cls.id, parentIds, userId, birthDay: p.birthDay || undefined,
      receiptId: prev?.receiptId ?? newReceiptId(usedReceiptIds(ctx.db)),
      extraClassIds: extraClassIds.length ? extraClassIds : undefined,
      adult: adult || undefined,
      enrollments: updateEnrollments(prev?.enrollments, prev ? classIdsOf(prev) : [], [cls.id, ...extraClassIds], dayKey(ctx.now)),
      archived: prev?.archived ?? false, parentConsent: prev?.parentConsent ?? false, faceTemplates: prev?.faceTemplates ?? [], facePhoto: prev?.facePhoto, faceModel: prev?.faceModel,
    };
    return { upsert: { students: [student], users } };
  },

  "student.archive"(ctx, { id, archived }) {
    const s = must(ctx.db.students.find((x) => x.id === id));
    requireManager(ctx, s.institutionId);
    // Arxivdagi o'quvchi tizimga kira olmaydi
    const acc = s.userId ? ctx.db.users.find((u) => u.id === s.userId) : undefined;
    return { upsert: { students: [{ ...s, archived }], users: acc ? [{ ...acc, active: !archived }] : [] } };
  },

  "teacher.save"(ctx, p) {
    requireManager(ctx);
    const inst = instOf(ctx);
    if (!p.name.trim()) throw new CommandError("err.required", { field: "Ism" });
    const prev = p.id ? must(ctx.db.users.find((u) => u.id === p.id && u.role === "teacher" && u.institutionId === inst)) : undefined;
    const phone = normalizePhone(p.phone);
    if (!phone) throw new CommandError("err.phone", { phone: p.phone });
    if (phoneTaken(ctx.db, phone, "teacher", inst, prev?.id)) throw new CommandError("err.phoneTaken", { phone: p.phone });
    const subjects = [...new Set(p.subjects.map((s) => s.trim()).filter(Boolean))];
    // Haq: berilmasa avvalgisi qoladi, null = olib tashlash
    let pay = prev?.pay;
    if (p.pay === null) pay = undefined;
    else if (p.pay) {
      const v = Number(p.pay.value);
      if (!["percent", "perLesson", "fixed"].includes(p.pay.mode) || !(v >= 0) || (p.pay.mode === "percent" && v > 100)) throw new CommandError("err.pay");
      pay = { mode: p.pay.mode, value: p.pay.mode === "percent" ? Math.round(v * 10) / 10 : Math.round(v) };
    }
    const user: AppUser = prev
      ? { ...prev, name: p.name.trim(), phone, subjects, pay }
      : { id: newId("t"), name: p.name.trim(), phone, role: "teacher", institutionId: inst, subjects, childIds: [], active: true, pay };
    return { upsert: { users: [user] } };
  },

  "teacher.setActive"(ctx, { id, active }) {
    const u = must(ctx.db.users.find((x) => x.id === id && x.role === "teacher"));
    requireManager(ctx, u.institutionId);
    if (!active && ctx.db.lessons.some((l) => l.teacherId === id)) throw new CommandError("err.teacherHasLessons");
    return { upsert: { users: [{ ...u, active }] } };
  },

  "class.save"(ctx, p) {
    requireManager(ctx);
    const inst = instOf(ctx);
    if (!p.name.trim()) throw new CommandError("err.required", { field: "Nomi" });
    if (ctx.db.classes.some((c) => c.institutionId === inst && c.name.trim().toLowerCase() === p.name.trim().toLowerCase() && c.id !== p.id)) {
      throw new CommandError("err.classExists", { name: p.name.trim() });
    }
    if (p.homeroomTeacherId) must(ctx.db.users.find((u) => u.id === p.homeroomTeacherId && u.role === "teacher" && u.institutionId === inst));
    const prev = p.id ? must(ctx.db.classes.find((c) => c.id === p.id && c.institutionId === inst)) : undefined;
    const money = (v?: number) => (v && v > 0 ? Math.round(v) : undefined);
    const mode = p.billingMode ?? "monthly";
    if (mode === "perLesson" && !money(p.lessonPrice)) throw new CommandError("err.required", { field: "lessonPrice" });
    if (mode === "course" && !money(p.coursePrice)) throw new CommandError("err.required", { field: "coursePrice" });
    const cls: SchoolClass = {
      id: prev?.id ?? newId("c"), institutionId: inst, name: p.name.trim(), homeroomTeacherId: p.homeroomTeacherId || undefined,
      monthlyFee: Math.max(0, Math.round(p.monthlyFee)),
      billingMode: mode === "monthly" ? undefined : mode,
      lessonPrice: mode === "perLesson" ? money(p.lessonPrice) : undefined,
      coursePrice: mode === "course" ? money(p.coursePrice) : undefined,
      absenceRefund: p.absenceRefund && p.absenceRefund !== "none" && mode !== "course" ? p.absenceRefund : undefined,
      branchId: p.branchId && ctx.db.institutions.find((i) => i.id === inst)?.settings.branches?.some((b) => b.id === p.branchId) ? p.branchId : undefined,
    };
    return { upsert: { classes: [cls] } };
  },

  "class.delete"(ctx, { id }) {
    const c = must(ctx.db.classes.find((x) => x.id === id));
    requireManager(ctx, c.institutionId);
    if (ctx.db.students.some((s) => inClass(s, id) && !s.archived)) throw new CommandError("err.classNotEmpty");
    return { remove: { classes: [id], lessons: ctx.db.lessons.filter((l) => l.classId === id).map((l) => l.id) } };
  },

  "lesson.save"(ctx, p) {
    const cls = must(ctx.db.classes.find((c) => c.id === p.classId));
    requireManager(ctx, cls.institutionId);
    must(ctx.db.users.find((u) => u.id === p.teacherId && u.role === "teacher" && u.institutionId === cls.institutionId));
    if (!p.subject.trim()) throw new CommandError("err.required", { field: "Fan" });
    if (!(p.weekday >= 1 && p.weekday <= 6) || !validTimeRange(p.start, p.end)) throw new CommandError("err.time");
    const lesson: Lesson = { id: p.id ?? newId("l"), classId: cls.id, subject: p.subject.trim(), teacherId: p.teacherId, weekday: p.weekday, start: p.start, end: p.end, room: p.room.trim() };
    const instClassIds = new Set(ctx.db.classes.filter((c) => c.institutionId === cls.institutionId).map((c) => c.id));
    const conflicts = findConflicts(lesson, ctx.db.lessons.filter((l) => instClassIds.has(l.classId)));
    if (conflicts.length) {
      const c = conflicts[0];
      throw new CommandError(`err.conflict.${c.kind}`, {
        className: ctx.db.classes.find((x) => x.id === c.lesson.classId)?.name ?? "",
        teacher: ctx.db.users.find((u) => u.id === c.lesson.teacherId)?.name ?? "",
        subject: c.lesson.subject, time: `${c.lesson.start}–${c.lesson.end}`, room: c.lesson.room,
      });
    }
    return { upsert: { lessons: [lesson] } };
  },

  "lesson.delete"(ctx, { id }) {
    const l = must(ctx.db.lessons.find((x) => x.id === id));
    const cls = must(ctx.db.classes.find((c) => c.id === l.classId));
    requireManager(ctx, cls.institutionId);
    return { remove: { lessons: [id] } };
  },

  "term.save"(ctx, p) {
    const t = must(ctx.db.terms.find((x) => x.id === p.id));
    requireManager(ctx, t.institutionId);
    if (!(p.startDay < p.endDay)) throw new CommandError("err.dates");
    return { upsert: { terms: [{ ...t, name: p.name.trim() || t.name, startDay: p.startDay, endDay: p.endDay }] } };
  },

  "settings.save"(ctx, { settings }) {
    requireManager(ctx);
    const inst = must(ctx.db.institutions.find((i) => i.id === instOf(ctx)));
    const s = settings;
    if (!(s.reviewThreshold > 0 && s.reviewThreshold < s.matchThreshold && s.matchThreshold < 1)) throw new CommandError("err.thresholds");
    if (!(s.lateAfterMinutes >= 0 && s.lateAfterMinutes <= 60) || !(s.paymentDueDay >= 1 && s.paymentDueDay <= 28)) throw new CommandError("err.settings");
    // Filiallar: nomi bo'lishi shart; guruh biriktirilgan filialni o'chirib bo'lmaydi
    const branches = (s.branches ?? []).map((b) => ({ id: b.id || newId("br"), name: String(b.name ?? "").trim(), address: b.address?.trim() || undefined }));
    if (branches.some((b) => !b.name)) throw new CommandError("err.required", { field: "Filial" });
    const ids = new Set(branches.map((b) => b.id));
    const orphan = ctx.db.classes.find((c) => c.institutionId === inst.id && c.branchId && !ids.has(c.branchId));
    if (orphan) throw new CommandError("err.branchInUse", { name: orphan.name });
    const orphanAdmin = ctx.db.users.find((u) => u.role === "admin" && u.institutionId === inst.id && u.branchIds?.some((b) => !ids.has(b)));
    if (orphanAdmin) throw new CommandError("err.branchInUse", { name: orphanAdmin.name });
    // Dam olish kunlari: sana to'g'ri, oxiri boshidan oldin emas, ko'pi bilan 1 yil
    const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
    const holidays = (s.holidays ?? []).map((h) => ({ id: h.id || newId("hd"), from: h.from, to: h.to || h.from, name: String(h.name ?? "").trim() }));
    for (const h of holidays) {
      if (!h.name) throw new CommandError("err.required", { field: "Nomi" });
      if (!DAY_RE.test(h.from) || !DAY_RE.test(h.to) || h.to < h.from || Date.parse(h.to) - Date.parse(h.from) > 366 * 86_400_000) throw new CommandError("err.dates");
    }
    holidays.sort((a, b) => a.from.localeCompare(b.from));
    // NVR kaliti faqat "nvr.configure" orqali o'zgaradi
    return { upsert: { institutions: [{ ...inst, settings: { ...s, branches: branches.length ? branches : undefined, holidays: holidays.length ? holidays : undefined, nvr: inst.settings.nvr } }] } };
  },

  "nvr.configure"(ctx, p) {
    requireManager(ctx);
    const inst = must(ctx.db.institutions.find((i) => i.id === instOf(ctx)));
    const prev = inst.settings.nvr ?? { enabled: false };
    let nvr = { ...prev, enabled: !!p.enabled };
    if (p.revoke) nvr = { enabled: false };
    if (p.keyHash !== undefined) {
      if (!/^[0-9a-f]{64}$/.test(p.keyHash) || !/^edn_[0-9a-f]{4,8}$/.test(p.keyPrefix ?? "")) throw new CommandError("err.required", { field: "keyHash" });
      nvr = { ...nvr, keyHash: p.keyHash, keyPrefix: p.keyPrefix, keyCreatedAt: ctx.now };
    }
    if (nvr.enabled && !nvr.keyHash) throw new CommandError("err.nvrNoKey");
    return { upsert: { institutions: [{ ...inst, settings: { ...inst.settings, nvr } }] } };
  },

  "institution.save"(ctx, p) {
    if (ctx.actor.role !== "superAdmin") deny();
    if (!p.name.trim()) throw new CommandError("err.required", { field: "Nomi" });
    const prev = p.id ? must(ctx.db.institutions.find((i) => i.id === p.id)) : undefined;
    const inst = prev
      ? { ...prev, name: p.name.trim(), type: p.type, city: p.city.trim() }
      : { id: newId("i"), name: p.name.trim(), type: p.type, city: p.city.trim(), active: true, createdAt: ctx.now, settings: { ...DEFAULT_SETTINGS, payments: {} } };
    const users: AppUser[] = [];
    if (p.director?.phone.trim()) users.push({ ...upsertPerson(ctx, p.director, "director", { institutionId: inst.id }), institutionId: inst.id });
    return { upsert: { institutions: [inst], users } };
  },

  /** Administrator qo'shish/tahrirlash: direktor (o'z muassasasi) yoki super admin. */
  "admin.save"(ctx, p) {
    const inst = ctx.actor.role === "superAdmin" ? must(p.institutionId) : ctx.actor.institutionId;
    if (!inst || !(ctx.actor.role === "superAdmin" || (ctx.actor.role === "director" && ctx.actor.institutionId === inst))) deny();
    must(ctx.db.institutions.find((i) => i.id === inst));
    if (!p.name.trim()) throw new CommandError("err.required", { field: "Ism" });
    const phone = normalizePhone(p.phone);
    if (!phone) throw new CommandError("err.phone", { phone: p.phone });
    const prev = p.id ? must(ctx.db.users.find((u) => u.id === p.id && u.role === "admin" && u.institutionId === inst)) : undefined;
    if (phoneTaken(ctx.db, phone, "admin", inst, prev?.id)) throw new CommandError("err.phoneTaken", { phone: p.phone });
    // Filiallar: bo'sh = butun markaz
    const known = new Set((ctx.db.institutions.find((i) => i.id === inst)?.settings.branches ?? []).map((b) => b.id));
    const branchIds = p.branchIds === undefined ? prev?.branchIds : [...new Set(p.branchIds)].filter((b) => known.has(b));
    const user: AppUser = prev
      ? { ...prev, name: p.name.trim(), phone, branchIds: branchIds?.length ? branchIds : undefined }
      : { id: newId("a"), name: p.name.trim(), phone, role: "admin", institutionId: inst, subjects: [], childIds: [], active: true, branchIds: branchIds?.length ? branchIds : undefined };
    return { upsert: { users: [user] } };
  },

  "admin.setActive"(ctx, { id, active }) {
    const u = must(ctx.db.users.find((x) => x.id === id && x.role === "admin"));
    if (!(ctx.actor.role === "superAdmin" || (ctx.actor.role === "director" && ctx.actor.institutionId === u.institutionId))) deny();
    return { upsert: { users: [{ ...u, active }] } };
  },

  "lead.save"(ctx, p) {
    requireManager(ctx);
    const inst = instOf(ctx);
    if (!p.name.trim()) throw new CommandError("err.required", { field: "Ism" });
    const phone = normalizePhone(p.phone);
    if (!phone) throw new CommandError("err.phone", { phone: p.phone });
    const prev = p.id ? must(ctx.db.leads.find((l) => l.id === p.id && l.institutionId === inst)) : undefined;
    if (!prev && ctx.db.leads.some((l) => l.institutionId === inst && l.phone === phone && l.status !== "enrolled" && l.status !== "lost")) {
      throw new CommandError("err.leadExists", { phone: p.phone });
    }
    const lead: Lead = prev
      ? { ...prev, name: p.name.trim(), phone, interest: p.interest.trim(), source: p.source, note: p.note?.trim() || undefined, updatedAt: ctx.now }
      : { id: newId("ld"), institutionId: inst, name: p.name.trim(), phone, interest: p.interest.trim(), source: p.source, status: "new", note: p.note?.trim() || undefined, createdAt: ctx.now, updatedAt: ctx.now, createdBy: ctx.actor.id };
    return { upsert: { leads: [lead] } };
  },

  "lead.update"(ctx, p) {
    const prev = must(ctx.db.leads.find((l) => l.id === p.id));
    requireManager(ctx, prev.institutionId);
    if (p.status === "enrolled") throw new CommandError("err.leadConvert");
    const next: Lead = { ...prev, updatedAt: ctx.now };
    if (p.status) next.status = p.status;
    if (p.trialClassId !== undefined) {
      if (p.trialClassId) must(ctx.db.classes.find((c) => c.id === p.trialClassId && c.institutionId === prev.institutionId));
      next.trialClassId = p.trialClassId || undefined;
    }
    if (p.trialDay !== undefined) next.trialDay = p.trialDay || undefined;
    if (p.trialCame !== undefined) next.trialCame = p.trialCame ?? undefined;
    if (next.trialClassId && next.trialDay && next.status !== "lost") next.status = "trial";
    if (p.lostReason !== undefined) next.lostReason = p.lostReason.trim() || undefined;
    if (p.note !== undefined) next.note = p.note.trim() || undefined;
    return { upsert: { leads: [next] } };
  },

  "lead.convert"(ctx, p) {
    const lead = must(ctx.db.leads.find((l) => l.id === p.id));
    requireManager(ctx, lead.institutionId);
    if (lead.studentId) throw new CommandError("err.leadConverted");
    // O'quvchi qo'shishning odatiy qoidalari (guruh, ota-ona, login, Kvitansiya ID)
    const created = handlers["student.save"](ctx, {
      name: lead.name, classId: p.classId, extraClassIds: p.extraClassIds, adult: p.adult,
      parents: p.adult ? [] : [{ name: p.parentName?.trim() || `${lead.name} (ota-onasi)`, phone: lead.phone }],
      studentPhone: p.adult ? lead.phone : undefined,
    });
    const student = created.upsert!.students![0];
    return { upsert: { ...created.upsert, leads: [{ ...lead, status: "enrolled", studentId: student.id, updatedAt: ctx.now }] } };
  },

  "lead.delete"(ctx, { id }) {
    const lead = must(ctx.db.leads.find((l) => l.id === id));
    requireManager(ctx, lead.institutionId);
    return { remove: { leads: [id] } };
  },

  "institution.setActive"(ctx, { id, active }) {
    if (ctx.actor.role !== "superAdmin") deny();
    const inst = must(ctx.db.institutions.find((i) => i.id === id));
    return { upsert: { institutions: [{ ...inst, active }] } };
  },
};

export function executeCommand<K extends CommandName>(db: Database, actor: AppUser, name: K, input: CommandMap[K], now: number): Patch {
  const h = handlers[name] as Handler<K>;
  if (!h) throw new CommandError("err.unknownCommand", { name });
  // Kirish sxema bo'yicha tekshiriladi; ortiqcha maydonlar tashlanadi
  const clean = parseCommandInput(name, input);
  const patch = h({ db, actor, now }, clean);
  const limit = branchLimit(db, actor);
  if (limit) guardBranchPatch(db, limit, patch);
  return patch;
}

/** Kirish mumkin bo'lgan foydalanuvchi (faol, muassasasi bloklanmagan). */
/** SMS bilan kirish: telefon bo'yicha asosiy profil (bir nechta bo'lsa keyin almashtiriladi). */
export function findLoginUser(db: Database, phone: string): AppUser {
  const p = normalizePhone(phone);
  const all = p ? db.users.filter((x) => x.phone === p && x.active) : [];
  if (!all.length) throw new CommandError("err.userNotFound", {}, 404);
  const ok = phoneProfiles(db, p!);
  if (!ok.length) throw new CommandError("err.institutionBlocked", {}, 403);
  return ok[0];
}

/** Demo kirish: SMS yuborilmaydi, kod 1111. */
export function verifyLogin(db: Database, phone: string, code: string): AppUser {
  const u = findLoginUser(db, phone);
  if (code !== DEMO_OTP) throw new CommandError("err.otp", {}, 401);
  return u;
}

/**
 * Onlayn to'lov tasdiqlanganda (Click/Payme serveridan): hisob-varaqqa to'lov
 * yozuvi va ota-onaga bildirishnoma. Bir xil tranzaksiya ikki marta yozilmaydi.
 */
export function onlinePaymentPatch(db: Database, invoiceId: string, amount: number, provider: "click" | "payme", externalId: string, now: number): Patch {
  const inv = db.invoices.find((i) => i.id === invoiceId);
  if (!inv) throw new CommandError("err.notFound", {}, 404);
  if (inv.payments.some((p) => p.externalId === externalId)) return {};
  const s = db.students.find((x) => x.id === inv.studentId);
  const next = { ...inv, payments: [...inv.payments, { id: newId("p"), amount: Math.round(amount), date: now, method: provider, recordedBy: "system", externalId }] };
  const notes = s ? [...new Set(notifyTargets(s))].map((userId) => ({
    id: newId("n"), userId, ...notifyPayment({ student: s.name, month: inv.month, amount: Math.round(amount), remaining: invoiceRemaining(next), method: provider }), time: now, read: false,
  })) : [];
  return { upsert: { invoices: [next], notifications: notes } };
}
