// Buyruqlarni bajaruvchi yagona "server" mantig'i: demo rejimda brauzerda,
// NestJS backendda esa serverda ishlaydi. Natija har doim Patch.
import { findConflicts, validTimeRange } from "./schedule";
import { hm } from "./dates";
import { invoiceRemaining, invoicesToCreate } from "./billing";
import { isValidGrade } from "./grades";
import { newId } from "./ids";
import {
  notifyAnnouncement, notifyAttendance, notifyGrade, notifyHomework, notifyMessage, notifyPayment,
  notifySubmissionChecked, notifySubmissionNew, type NotificationDraft,
} from "./notify";
import { CommandError, type Patch } from "./patch";
import { canManageInstitution, canTeachLesson, normalizePhone, teachesSubjectInClass } from "./permissions";
import { DEMO_OTP } from "./seed";
import type { CommandMap, CommandName } from "./commands";
import {
  DEFAULT_SETTINGS,
  type AppNotification, type AppUser, type Database, type Lesson, type SchoolClass, type Student, type Thread,
} from "./types";

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
const must = <T>(v: T | undefined | null): T => (v ?? notFound()) as T;

function instOf(ctx: Ctx): string {
  return ctx.actor.institutionId ?? deny();
}

function requireDirector(ctx: Ctx, institutionId?: string) {
  if (!canManageInstitution(ctx.actor, institutionId ?? ctx.actor.institutionId ?? "")) deny();
}

function notifications(ctx: Ctx, userIds: Iterable<string>, d: NotificationDraft): AppNotification[] {
  return [...new Set(userIds)].map((userId) => ({ id: newId("n"), userId, ...d, time: ctx.now, read: false }));
}

function studentParents(s: Student) {
  return s.parentIds;
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
  const existing = ctx.db.users.find((u) => u.phone === phone);
  if (existing) {
    if (existing.role !== role) throw new CommandError("err.phoneTaken", { phone: input.phone });
    if (existing.institutionId && extra.institutionId && existing.institutionId !== extra.institutionId) throw new CommandError("err.phoneTaken", { phone: input.phone });
    return { ...existing, name: input.name.trim() || existing.name, active: true };
  }
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
      const s = must(ctx.db.students.find((x) => x.id === m.studentId && x.classId === cls.id));
      const prev = ctx.db.attendance.find((a) => a.studentId === s.id && a.lessonId === lessonId && a.day === day);
      const rec = {
        id: prev?.id ?? newId("a"), studentId: s.id, lessonId, day, status: m.status, source: m.source,
        markedAt: ctx.now, markedBy: ctx.actor.id, snapshot: m.snapshot ?? prev?.snapshot, matchScore: m.score,
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
    const allowed = ctx.actor.role === "director" ? ctx.actor.institutionId === s.institutionId : teachesSubjectInClass(ctx.actor, ctx.db.lessons, s.classId, p.subject);
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
    if (g.teacherId !== ctx.actor.id && ctx.actor.role !== "director") deny();
    return { remove: { grades: [id] } };
  },

  "grade.setFinal"(ctx, p) {
    const s = must(ctx.db.students.find((x) => x.id === p.studentId));
    const allowed = ctx.actor.role === "director" ? ctx.actor.institutionId === s.institutionId : teachesSubjectInClass(ctx.actor, ctx.db.lessons, s.classId, p.subject);
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
    const allowed = ctx.actor.role === "director" ? ctx.actor.institutionId === cls.institutionId : teachesSubjectInClass(ctx.actor, ctx.db.lessons, cls.id, p.subject);
    if (!allowed) deny();
    if (!p.title.trim()) throw new CommandError("err.required", { field: "Mavzu" });
    checkAttachments(p.attachments);
    const prev = p.id ? must(ctx.db.homeworks.find((h) => h.id === p.id)) : undefined;
    const hw = {
      id: prev?.id ?? newId("h"), classId: cls.id, subject: p.subject, teacherId: prev?.teacherId ?? ctx.actor.id, title: p.title.trim(),
      description: p.description.trim(), dueDay: p.dueDay, createdAt: prev?.createdAt ?? ctx.now, attachments: p.attachments,
    };
    const students = ctx.db.students.filter((s) => s.classId === cls.id && !s.archived);
    const notes = prev ? [] : students.flatMap((s) =>
      notifications(ctx, [...s.parentIds, ...(s.userId ? [s.userId] : [])], notifyHomework({ student: s.name, subject: hw.subject, title: hw.title, due: hw.dueDay })));
    return { upsert: { homeworks: [hw], notifications: notes } };
  },

  "homework.delete"(ctx, { id }) {
    const h = must(ctx.db.homeworks.find((x) => x.id === id));
    if (h.teacherId !== ctx.actor.id && ctx.actor.role !== "director") deny();
    return { remove: { homeworks: [id], submissions: ctx.db.submissions.filter((s) => s.homeworkId === id).map((s) => s.id) } };
  },

  "submission.submit"(ctx, p) {
    if (ctx.actor.role !== "student" || !ctx.actor.studentId) deny();
    const s = must(ctx.db.students.find((x) => x.id === ctx.actor.studentId));
    const h = must(ctx.db.homeworks.find((x) => x.id === p.homeworkId && x.classId === s.classId));
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
    if (h.teacherId !== ctx.actor.id && ctx.actor.role !== "director") deny();
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
    requireDirector(ctx);
    const inst = must(ctx.db.institutions.find((i) => i.id === instOf(ctx)));
    const students = ctx.db.students.filter((s) => s.institutionId === inst.id);
    const created = invoicesToCreate(month, students, ctx.db.classes.filter((c) => c.institutionId === inst.id), ctx.db.invoices, inst.settings.paymentDueDay)
      .map((i) => ({ ...i, id: newId("inv") }));
    return { upsert: { invoices: created } };
  },

  "invoice.adjust"(ctx, p) {
    const inv = must(ctx.db.invoices.find((i) => i.id === p.id));
    const s = must(ctx.db.students.find((x) => x.id === inv.studentId));
    requireDirector(ctx, s.institutionId);
    if (!(p.amount >= 0)) throw new CommandError("err.amount");
    return { upsert: { invoices: [{ ...inv, amount: Math.round(p.amount), note: p.note?.trim() || undefined }] } };
  },

  "payment.add"(ctx, p) {
    const inv = must(ctx.db.invoices.find((i) => i.id === p.invoiceId));
    const s = must(ctx.db.students.find((x) => x.id === inv.studentId));
    requireDirector(ctx, s.institutionId);
    const remaining = invoiceRemaining(inv);
    if (!(p.amount > 0) || p.amount > remaining) throw new CommandError("err.amountRange", { max: remaining });
    const next = { ...inv, payments: [...inv.payments, { id: newId("p"), amount: Math.round(p.amount), date: ctx.now, method: p.method, recordedBy: ctx.actor.id }] };
    return {
      upsert: {
        invoices: [next],
        notifications: notifications(ctx, s.parentIds, notifyPayment({ student: s.name, month: inv.month, amount: p.amount, remaining: invoiceRemaining(next), method: p.method })),
      },
    };
  },

  "payment.demoOnline"(ctx, p) {
    const inv = must(ctx.db.invoices.find((i) => i.id === p.invoiceId));
    const s = must(ctx.db.students.find((x) => x.id === inv.studentId));
    if (!(ctx.actor.role === "parent" && ctx.actor.childIds.includes(s.id))) deny();
    const amount = invoiceRemaining(inv);
    if (amount <= 0) throw new CommandError("err.alreadyPaid");
    const next = { ...inv, payments: [...inv.payments, { id: newId("p"), amount, date: ctx.now, method: p.provider, recordedBy: ctx.actor.id, externalId: `demo-${Date.now()}` }] };
    return {
      upsert: {
        invoices: [next],
        notifications: notifications(ctx, s.parentIds, notifyPayment({ student: s.name, month: inv.month, amount, remaining: 0, method: p.provider })),
      },
    };
  },

  "message.send"(ctx, p) {
    const text = p.text.trim();
    if (!text) throw new CommandError("err.required", { field: "Xabar" });
    const s = must(ctx.db.students.find((x) => x.id === p.studentId));
    const teacher = must(ctx.db.users.find((u) => u.id === p.teacherId && u.role === "teacher"));
    let parentId: string;
    if (ctx.actor.role === "parent") {
      if (!ctx.actor.childIds.includes(s.id)) deny();
      parentId = ctx.actor.id;
    } else if (ctx.actor.role === "teacher" && ctx.actor.id === teacher.id) {
      parentId = p.parentId ?? s.parentIds[0] ?? deny();
      if (!s.parentIds.includes(parentId)) deny();
    } else return deny();
    const teaches = ctx.db.lessons.some((l) => l.classId === s.classId && l.teacherId === teacher.id) ||
      ctx.db.classes.some((c) => c.id === s.classId && c.homeroomTeacherId === teacher.id);
    if (!teaches) deny();
    const prev = ctx.db.threads.find((t) => t.studentId === s.id && t.teacherId === teacher.id && t.parentId === parentId);
    const thread: Thread = prev ? { ...prev, lastMessageAt: ctx.now } : { id: newId("th"), institutionId: s.institutionId, studentId: s.id, parentId, teacherId: teacher.id, lastMessageAt: ctx.now };
    const msg = { id: newId("m"), threadId: thread.id, senderId: ctx.actor.id, text, time: ctx.now, readBy: [ctx.actor.id] };
    const toParent = ctx.actor.role === "teacher";
    return {
      upsert: {
        threads: [thread],
        messages: [msg],
        notifications: notifications(ctx, [toParent ? parentId : teacher.id], notifyMessage({ from: ctx.actor.name, student: s.name, text, threadId: thread.id, forRole: toParent ? "parent" : "teacher" })),
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
    requireDirector(ctx);
    if (!p.title.trim() || !p.body.trim()) throw new CommandError("err.required", { field: "Matn" });
    const inst = instOf(ctx);
    const students = ctx.db.students.filter((s) => s.institutionId === inst && !s.archived && (!p.classId || s.classId === p.classId));
    const recipients = students.flatMap((s) => [...s.parentIds, ...(s.userId ? [s.userId] : [])]);
    return { upsert: { notifications: notifications(ctx, recipients, notifyAnnouncement({ title: p.title.trim(), body: p.body.trim() })) } };
  },

  "consent.set"(ctx, { studentId, consent }) {
    const s = must(ctx.db.students.find((x) => x.id === studentId));
    if (!(ctx.actor.role === "parent" && ctx.actor.childIds.includes(s.id))) deny();
    return { upsert: { students: [consent ? { ...s, parentConsent: true } : { ...s, parentConsent: false, faceTemplates: [], facePhoto: undefined }] } };
  },

  "face.enroll"(ctx, { studentId, templates, photo }) {
    const s = must(ctx.db.students.find((x) => x.id === studentId));
    const teaches = ctx.db.lessons.some((l) => l.classId === s.classId && l.teacherId === ctx.actor.id) ||
      ctx.db.classes.some((c) => c.id === s.classId && c.homeroomTeacherId === ctx.actor.id);
    if (!(teaches || (ctx.actor.role === "director" && ctx.actor.institutionId === s.institutionId))) deny();
    if (!s.parentConsent) throw new CommandError("err.noConsent");
    if (templates.length === 0 || templates.some((t) => t.length !== 192)) throw new CommandError("err.faceTemplate");
    return { upsert: { students: [{ ...s, faceTemplates: templates, facePhoto: photo }] } };
  },

  "student.save"(ctx, p) {
    requireDirector(ctx);
    const inst = instOf(ctx);
    if (!p.name.trim()) throw new CommandError("err.required", { field: "Ism" });
    const cls = must(ctx.db.classes.find((c) => c.id === p.classId && c.institutionId === inst));
    const prev = p.id ? must(ctx.db.students.find((s) => s.id === p.id && s.institutionId === inst)) : undefined;
    const id = prev?.id ?? newId("s");
    const users: AppUser[] = [];
    const parentIds: string[] = [];
    for (const person of p.parents.filter((x) => x.phone.trim())) {
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
    let userId = prev?.userId;
    if (p.studentPhone?.trim()) {
      const su = upsertPerson(ctx, { name: p.name, phone: p.studentPhone }, "student", { institutionId: inst, studentId: id });
      if (su.studentId && su.studentId !== id) throw new CommandError("err.phoneTaken", { phone: p.studentPhone });
      users.push({ ...su, studentId: id, name: p.name.trim() });
      userId = su.id;
    } else if (prev?.userId) {
      const su = ctx.db.users.find((u) => u.id === prev.userId);
      if (su) users.push({ ...su, active: false });
      userId = undefined;
    }
    const student: Student = {
      id, institutionId: inst, name: p.name.trim(), classId: cls.id, parentIds, userId, birthDay: p.birthDay || undefined,
      archived: prev?.archived ?? false, parentConsent: prev?.parentConsent ?? false, faceTemplates: prev?.faceTemplates ?? [], facePhoto: prev?.facePhoto,
    };
    return { upsert: { students: [student], users } };
  },

  "student.archive"(ctx, { id, archived }) {
    const s = must(ctx.db.students.find((x) => x.id === id));
    requireDirector(ctx, s.institutionId);
    return { upsert: { students: [{ ...s, archived }] } };
  },

  "teacher.save"(ctx, p) {
    requireDirector(ctx);
    const inst = instOf(ctx);
    if (!p.name.trim()) throw new CommandError("err.required", { field: "Ism" });
    const prev = p.id ? must(ctx.db.users.find((u) => u.id === p.id && u.role === "teacher" && u.institutionId === inst)) : undefined;
    const phone = normalizePhone(p.phone);
    if (!phone) throw new CommandError("err.phone", { phone: p.phone });
    const clash = ctx.db.users.find((u) => u.phone === phone && u.id !== prev?.id);
    if (clash) throw new CommandError("err.phoneTaken", { phone: p.phone });
    const subjects = [...new Set(p.subjects.map((s) => s.trim()).filter(Boolean))];
    const user: AppUser = prev
      ? { ...prev, name: p.name.trim(), phone, subjects }
      : { id: newId("t"), name: p.name.trim(), phone, role: "teacher", institutionId: inst, subjects, childIds: [], active: true };
    return { upsert: { users: [user] } };
  },

  "teacher.setActive"(ctx, { id, active }) {
    const u = must(ctx.db.users.find((x) => x.id === id && x.role === "teacher"));
    requireDirector(ctx, u.institutionId);
    if (!active && ctx.db.lessons.some((l) => l.teacherId === id)) throw new CommandError("err.teacherHasLessons");
    return { upsert: { users: [{ ...u, active }] } };
  },

  "class.save"(ctx, p) {
    requireDirector(ctx);
    const inst = instOf(ctx);
    if (!p.name.trim()) throw new CommandError("err.required", { field: "Nomi" });
    if (ctx.db.classes.some((c) => c.institutionId === inst && c.name.trim().toLowerCase() === p.name.trim().toLowerCase() && c.id !== p.id)) {
      throw new CommandError("err.classExists", { name: p.name.trim() });
    }
    if (p.homeroomTeacherId) must(ctx.db.users.find((u) => u.id === p.homeroomTeacherId && u.role === "teacher" && u.institutionId === inst));
    const prev = p.id ? must(ctx.db.classes.find((c) => c.id === p.id && c.institutionId === inst)) : undefined;
    const cls: SchoolClass = { id: prev?.id ?? newId("c"), institutionId: inst, name: p.name.trim(), homeroomTeacherId: p.homeroomTeacherId || undefined, monthlyFee: Math.max(0, Math.round(p.monthlyFee)) };
    return { upsert: { classes: [cls] } };
  },

  "class.delete"(ctx, { id }) {
    const c = must(ctx.db.classes.find((x) => x.id === id));
    requireDirector(ctx, c.institutionId);
    if (ctx.db.students.some((s) => s.classId === id && !s.archived)) throw new CommandError("err.classNotEmpty");
    return { remove: { classes: [id], lessons: ctx.db.lessons.filter((l) => l.classId === id).map((l) => l.id) } };
  },

  "lesson.save"(ctx, p) {
    const cls = must(ctx.db.classes.find((c) => c.id === p.classId));
    requireDirector(ctx, cls.institutionId);
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
    requireDirector(ctx, cls.institutionId);
    return { remove: { lessons: [id] } };
  },

  "term.save"(ctx, p) {
    const t = must(ctx.db.terms.find((x) => x.id === p.id));
    requireDirector(ctx, t.institutionId);
    if (!(p.startDay < p.endDay)) throw new CommandError("err.dates");
    return { upsert: { terms: [{ ...t, name: p.name.trim() || t.name, startDay: p.startDay, endDay: p.endDay }] } };
  },

  "settings.save"(ctx, { settings }) {
    requireDirector(ctx);
    const inst = must(ctx.db.institutions.find((i) => i.id === instOf(ctx)));
    const s = settings;
    if (!(s.reviewThreshold > 0 && s.reviewThreshold < s.matchThreshold && s.matchThreshold < 1)) throw new CommandError("err.thresholds");
    if (!(s.lateAfterMinutes >= 0 && s.lateAfterMinutes <= 60) || !(s.paymentDueDay >= 1 && s.paymentDueDay <= 28)) throw new CommandError("err.settings");
    return { upsert: { institutions: [{ ...inst, settings: s }] } };
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

  "institution.setActive"(ctx, { id, active }) {
    if (ctx.actor.role !== "superAdmin") deny();
    const inst = must(ctx.db.institutions.find((i) => i.id === id));
    return { upsert: { institutions: [{ ...inst, active }] } };
  },
};

export function executeCommand<K extends CommandName>(db: Database, actor: AppUser, name: K, input: CommandMap[K], now: number): Patch {
  const h = handlers[name] as Handler<K>;
  if (!h) throw new CommandError("err.unknownCommand", { name });
  return h({ db, actor, now }, input);
}

/** Kirish mumkin bo'lgan foydalanuvchi (faol, muassasasi bloklanmagan). */
export function findLoginUser(db: Database, phone: string): AppUser {
  const p = normalizePhone(phone);
  const u = p ? db.users.find((x) => x.phone === p && x.active) : undefined;
  if (!u) throw new CommandError("err.userNotFound", {}, 404);
  const inst = u.institutionId ? db.institutions.find((i) => i.id === u.institutionId) : undefined;
  if (inst && !inst.active) throw new CommandError("err.institutionBlocked", {}, 403);
  return u;
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
  const notes = s ? [...new Set(s.parentIds)].map((userId) => ({
    id: newId("n"), userId, ...notifyPayment({ student: s.name, month: inv.month, amount: Math.round(amount), remaining: invoiceRemaining(next), method: provider }), time: now, read: false,
  })) : [];
  return { upsert: { invoices: [next], notifications: notes } };
}
