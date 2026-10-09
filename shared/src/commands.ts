import type {
  Attachment,
  AttendanceSource,
  AttendanceStatus,
  GradeType,
  InstitutionSettings,
  InstitutionType,
  PaymentMethod,
  SubmissionStatus,
} from "./types";

export interface PersonInput {
  name: string;
  phone: string;
}

/**
 * Barcha o'zgartirish buyruqlari. Web demo rejimida ular brauzerda
 * bajariladi, backend rejimida POST /api/commands/:name ga yuboriladi.
 * Ikkala holatda ham natija Patch bo'ladi.
 */
export interface CommandMap {
  "attendance.mark": {
    lessonId: string;
    day: string;
    marks: { studentId: string; status: AttendanceStatus; source: AttendanceSource; snapshot?: string; score?: number }[];
  };
  "grade.add": { studentId: string; lessonId?: string; subject: string; value: number; type: GradeType; day: string; comment?: string };
  "grade.remove": { id: string };
  "grade.setFinal": { studentId: string; subject: string; termId: string; type: "term" | "year"; value: number | null };
  "homework.save": {
    id?: string;
    classId: string;
    subject: string;
    title: string;
    description: string;
    dueDay: string;
    attachments: Attachment[];
  };
  "homework.delete": { id: string };
  "submission.submit": { homeworkId: string; text: string; attachments: Attachment[] };
  "submission.review": { id: string; status: Exclude<SubmissionStatus, "submitted">; grade?: number; feedback?: string };
  "invoice.generate": { month: string };
  "invoice.adjust": { id: string; amount: number; note?: string };
  "payment.add": { invoiceId: string; amount: number; method: PaymentMethod };
  /** Faqat demo rejimi: onlayn to'lov muvaffaqiyatli bo'lganini taqlid qiladi. */
  "payment.demoOnline": { invoiceId: string; provider: "click" | "payme" };
  "message.send": { studentId: string; teacherId: string; parentId?: string; text: string };
  "thread.read": { threadId: string };
  "notification.read": { id?: string; all?: boolean };
  "announcement.send": { classId?: string; title: string; body: string };
  "consent.set": { studentId: string; consent: boolean };
  "face.enroll": { studentId: string; templates: number[][]; photo?: string };
  "student.save": {
    id?: string;
    name: string;
    classId: string;
    birthDay?: string;
    parents: PersonInput[];
    /** O'quvchining o'z kirish raqami (ixtiyoriy). */
    studentPhone?: string;
  };
  "student.archive": { id: string; archived: boolean };
  "teacher.save": { id?: string; name: string; phone: string; subjects: string[] };
  "teacher.setActive": { id: string; active: boolean };
  "class.save": { id?: string; name: string; homeroomTeacherId?: string; monthlyFee: number };
  "class.delete": { id: string };
  "lesson.save": { id?: string; classId: string; subject: string; teacherId: string; weekday: number; start: string; end: string; room: string };
  "lesson.delete": { id: string };
  "term.save": { id: string; name: string; startDay: string; endDay: string };
  "settings.save": { settings: InstitutionSettings };
  "institution.save": { id?: string; name: string; type: InstitutionType; city: string; director?: PersonInput };
  "institution.setActive": { id: string; active: boolean };
}

export type CommandName = keyof CommandMap;
