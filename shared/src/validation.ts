// Har bir buyruq kirishining qat'iy sxemasi. Server (va demo) buyruqni bajarishdan oldin
// shu yerda tekshiradi: turi, uzunligi, formati. Noma'lum maydonlar olib tashlanadi,
// shuning uchun mijoz yozuvga ortiqcha maydon qo'sha olmaydi.
import { z } from "zod";

import type { CommandMap, CommandName } from "./commands";
import { CommandError } from "./patch";

const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const validDay = (s: string) => {
  if (!DAY_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 && y >= 2000 && y <= 2100;
};

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const day = z.string().refine(validDay, "day");
const month = z.string().regex(/^20\d\d-(0[1-9]|1[0-2])$/);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
/** Matn: boshidagi/oxiridagi bo'shliq olib tashlanadi, boshqaruv belgilari taqiqlanadi. */
const text = (max: number) => z.string().max(max).refine((s) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(s), "control");
const name = text(120);
const phone = z.string().max(24).regex(/^[\d\s+()-]*$/);
const money = z.number().finite().min(0).max(1_000_000_000);
const bool = z.boolean();

/** Rasm: data URL (demo/yuz kesimi) yoki http(s) havola. javascript: va boshqalar taqiqlangan. */
const imageUrl = (maxBytes: number) => z.string().max(Math.ceil(maxBytes * 1.4)).regex(/^(data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+|https?:\/\/[^\s"'<>]+)$/);
const fileUrl = z.string().max(3_000_000).regex(/^(data:[\w.+-]+\/[\w.+-]+;base64,[A-Za-z0-9+/=]+|https?:\/\/[^\s"'<>]+)$/);

const attachment = z.object({ id, name: text(200), type: z.string().max(100), size: z.number().int().min(0).max(5_000_000), url: fileUrl });
const attachments = z.array(attachment).max(5);
const person = z.object({ name, phone });

const attendanceStatus = z.enum(["present", "late", "absent", "excused"]);
const gradeType = z.enum(["current", "oral", "written", "control", "term", "year"]);
const paymentMethod = z.enum(["cash", "card", "transfer", "click", "payme"]);
const leadStatus = z.enum(["new", "contacted", "trial", "enrolled", "lost"]);
const leadSource = z.enum(["instagram", "telegram", "referral", "outdoor", "walkin", "other"]);
const merchant = z.string().max(64).regex(/^[A-Za-z0-9_-]*$/).optional();

const settings = z.object({
  faceModel: z.string().max(64).optional(),
  matchThreshold: z.number().finite(),
  reviewThreshold: z.number().finite(),
  faceLiveness: bool,
  lateAfterMinutes: z.number().int(),
  paymentDueDay: z.number().int(),
  gradesEnabled: bool.optional(),
  branches: z.array(z.object({ id: z.string().max(64).regex(/^[A-Za-z0-9_-]*$/), name, address: text(200).optional() })).max(50).optional(),
  holidays: z.array(z.object({ id: z.string().max(64).regex(/^[A-Za-z0-9_-]*$/), from: day, to: z.union([day, z.literal("")]), name })).max(200).optional(),
  payments: z.object({ clickServiceId: merchant, clickMerchantId: merchant, paymeMerchantId: merchant, paymeAccountField: merchant }),
  // NVR faqat nvr.configure orqali: bu yerda kelgani e'tiborsiz
});

const SCHEMAS: { [K in CommandName]: z.ZodType<unknown> } = {
  "attendance.mark": z.object({
    lessonId: id, day,
    marks: z.array(z.object({
      studentId: id, status: attendanceStatus, source: z.enum(["manual", "face", "nvr"]),
      snapshot: imageUrl(300_000).optional(), score: z.number().finite().min(-1).max(1).optional(),
    })).min(1).max(200),
  }),
  "grade.add": z.object({ studentId: id, lessonId: id.optional(), subject: name, value: z.number().int(), type: gradeType, day, comment: text(500).optional() }),
  "grade.remove": z.object({ id }),
  "grade.setFinal": z.object({ studentId: id, subject: name, termId: id, type: z.enum(["term", "year"]), value: z.number().int().nullable() }),
  "homework.save": z.object({ id: id.optional(), classId: id, subject: name, title: text(200), description: text(5000), dueDay: day, attachments }),
  "homework.delete": z.object({ id }),
  "submission.submit": z.object({ homeworkId: id, text: text(5000), attachments }),
  "submission.review": z.object({ id, status: z.enum(["checked", "returned"]), grade: z.number().int().optional(), feedback: text(2000).optional() }),
  "invoice.generate": z.object({ month }),
  "payment.remind": z.object({ month: month.optional(), invoiceIds: z.array(id).max(2000).optional() }),
  "invoice.adjust": z.object({ id, amount: money, note: text(500).optional() }),
  "payment.add": z.object({ invoiceId: id, amount: money.refine((n) => n > 0, "positive"), method: paymentMethod }),
  "payment.demoOnline": z.object({ invoiceId: id, provider: z.enum(["click", "payme"]) }),
  "message.send": z.object({ studentId: id, teacherId: id, parentId: id.optional(), text: text(2000) }),
  "thread.read": z.object({ threadId: id }),
  "notification.read": z.object({ id: id.optional(), all: bool.optional() }),
  "announcement.send": z.object({ classId: id.optional(), title: text(200), body: text(2000) }),
  "consent.set": z.object({ studentId: id, consent: bool }),
  "face.enroll": z.object({
    studentId: id,
    templates: z.array(z.array(z.number().finite().min(-100).max(100)).min(64).max(1024)).min(1).max(20),
    photo: imageUrl(300_000).optional(),
    model: z.string().max(64).optional(),
  }),
  "student.save": z.object({
    id: id.optional(), name, classId: id, birthDay: day.optional(), parents: z.array(person).max(4),
    extraClassIds: z.array(id).max(20).optional(), adult: bool.optional(), studentPhone: phone.optional(),
  }),
  "student.archive": z.object({ id, archived: bool }),
  "student.import": z.object({
    students: z.array(z.object({
      name, classId: id, birthDay: day.optional(), parents: z.array(person).max(4), studentPhone: phone.optional(),
    })).min(1).max(200),
  }),
  "student.photo": z.object({ studentId: id, photo: imageUrl(300_000).nullable() }),
  "teacher.save": z.object({
    id: id.optional(), name, phone, subjects: z.array(name).max(20),
    pay: z.object({ mode: z.enum(["percent", "perLesson", "fixed"]), value: money }).nullable().optional(),
  }),
  "teacher.setActive": z.object({ id, active: bool }),
  "class.save": z.object({
    id: id.optional(), name, homeroomTeacherId: id.optional(), monthlyFee: money,
    billingMode: z.enum(["monthly", "perLesson", "course"]).optional(), lessonPrice: money.optional(), coursePrice: money.optional(),
    absenceRefund: z.enum(["none", "excused", "all"]).optional(), branchId: id.optional(),
  }),
  "class.delete": z.object({ id }),
  "lesson.save": z.object({ id: id.optional(), classId: id, subject: name, teacherId: id, weekday: z.number().int().min(1).max(7), start: time, end: time, room: text(40) }),
  "lesson.delete": z.object({ id }),
  "term.save": z.object({ id, name: text(60), startDay: day, endDay: day }),
  "settings.save": z.object({ settings }),
  "nvr.configure": z.object({ enabled: bool, keyHash: z.string().max(64).optional(), keyPrefix: z.string().max(16).optional(), revoke: bool.optional() }),
  "institution.save": z.object({ id: id.optional(), name: text(160), type: z.enum(["school", "center"]), city: text(80), director: person.optional() }),
  "institution.setActive": z.object({ id, active: bool }),
  "admin.save": z.object({ id: id.optional(), name, phone, institutionId: id.optional(), branchIds: z.array(id).max(50).optional() }),
  "admin.setActive": z.object({ id, active: bool }),
  "lead.save": z.object({ id: id.optional(), name, phone, interest: text(120), source: leadSource, note: text(1000).optional() }),
  "lead.update": z.object({
    id, status: leadStatus.optional(), trialClassId: id.nullable().optional(), trialDay: day.nullable().optional(),
    trialCame: bool.nullable().optional(), lostReason: text(200).optional(), note: text(1000).optional(),
  }),
  "lead.convert": z.object({ id, classId: id, extraClassIds: z.array(id).max(20).optional(), adult: bool.optional(), parentName: name.optional() }),
  "lead.delete": z.object({ id }),
};

/**
 * Buyruq kirishini tekshiradi va tozalangan nusxasini qaytaradi.
 * Xato bo'lsa: err.invalid { field: "marks.0.status" } (400).
 */
export function parseCommandInput<K extends CommandName>(name: K, input: unknown): CommandMap[K] {
  const schema = SCHEMAS[name];
  if (!schema) throw new CommandError("err.unknownCommand", { name }, 404);
  const r = schema.safeParse(input);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new CommandError("err.invalid", { field: issue?.path.join(".") || "body" }, 400);
  }
  return r.data as CommandMap[K];
}
