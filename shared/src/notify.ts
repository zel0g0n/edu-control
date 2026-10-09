import type { AttendanceStatus, NotificationType } from "./types";

/** Bildirishnoma qolipi: matn foydalanuvchi tilida "key" bo'yicha chiziladi. */
export interface NotificationDraft {
  type: NotificationType;
  key: string;
  params: Record<string, string | number>;
  image?: string;
  link?: string;
}

export const notifyAttendance = (p: {
  student: string; subject: string; time: string; status: AttendanceStatus; viaFace: boolean; snapshot?: string; studentId: string;
}): NotificationDraft => ({
  type: "attendance",
  key: `notif.attendance.${p.status}${p.viaFace && (p.status === "present" || p.status === "late") ? ".face" : ""}`,
  params: { student: p.student, subject: p.subject, time: p.time },
  image: p.status === "present" || p.status === "late" ? p.snapshot : undefined,
  link: `/parent?child=${p.studentId}`,
});

export const notifyGrade = (p: { student: string; subject: string; value: number; typeKey: string; comment?: string }): NotificationDraft => ({
  type: "grade",
  key: p.comment ? "notif.grade.comment" : "notif.grade",
  params: { student: p.student, subject: p.subject, value: p.value, gradeType: p.typeKey, comment: p.comment ?? "" },
  link: "/parent/grades",
});

export const notifyHomework = (p: { student: string; subject: string; title: string; due: string }): NotificationDraft => ({
  type: "homework",
  key: "notif.homework",
  params: p,
  link: "/parent/homework",
});

export const notifyPayment = (p: { student: string; month: string; amount: number; remaining: number; method: string }): NotificationDraft => ({
  type: "payment",
  key: "notif.payment",
  params: p,
  link: "/parent/payments",
});

export const notifyMessage = (p: { from: string; student: string; text: string; threadId: string; forRole: "parent" | "teacher" }): NotificationDraft => ({
  type: "message",
  key: "notif.message",
  params: { from: p.from, student: p.student, text: p.text.length > 80 ? `${p.text.slice(0, 80)}…` : p.text },
  link: `/${p.forRole}/messages/${p.threadId}`,
});

export const notifySubmissionChecked = (p: { student: string; title: string; grade?: number }): NotificationDraft => ({
  type: "submission",
  key: p.grade ? "notif.submission.graded" : "notif.submission.checked",
  params: { student: p.student, title: p.title, grade: p.grade ?? "" },
  link: "/student/homework",
});

export const notifySubmissionNew = (p: { student: string; title: string }): NotificationDraft => ({
  type: "submission",
  key: "notif.submission.new",
  params: p,
  link: "/teacher/homework",
});

export const notifyAnnouncement = (p: { title: string; body: string }): NotificationDraft => ({
  type: "announcement",
  key: "notif.announcement",
  params: p,
});
