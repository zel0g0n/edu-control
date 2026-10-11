import { inClass } from "./membership";
import type { AppUser, Lesson, SchoolClass, Student } from "./types";

/** Muassasani boshqarish (o'zgartirish): faqat administrator (super admin har doim). Direktor faqat ko'radi. */
export function canManageInstitution(user: AppUser, institutionId: string): boolean {
  return user.role === "superAdmin" || (user.role === "admin" && user.institutionId === institutionId);
}

/** Muassasaning hamma ma'lumotini ko'rish: direktor va administrator. */
export function canViewInstitution(user: AppUser, institutionId: string): boolean {
  return user.role === "superAdmin" || ((user.role === "director" || user.role === "admin") && user.institutionId === institutionId);
}

/** Muassasa xodimi: direktor yoki administrator (ko'rish huquqi bir xil). */
export function isStaffRole(role: AppUser["role"]): boolean {
  return role === "director" || role === "admin";
}

/** O'qituvchi o'zi o'tadigan darsda davomat oladi va baho qo'yadi; administrator ham mumkin. */
export function canTeachLesson(user: AppUser, lesson: Lesson, cls: SchoolClass): boolean {
  if (user.role === "admin") return user.institutionId === cls.institutionId;
  return user.role === "teacher" && lesson.teacherId === user.id;
}

/** O'qituvchi shu sinfda shu fanni o'tadimi. */
export function teachesSubjectInClass(user: AppUser, lessons: Lesson[], classId: string, subject: string): boolean {
  return lessons.some((l) => l.classId === classId && l.subject === subject && l.teacherId === user.id);
}

export function canViewStudent(user: AppUser, student: Student, lessons: Lesson[], classes: SchoolClass[]): boolean {
  switch (user.role) {
    case "superAdmin":
      return true;
    case "director":
    case "admin":
      return user.institutionId === student.institutionId;
    case "parent":
      return user.childIds.includes(student.id);
    case "student":
      return user.studentId === student.id;
    case "teacher":
      return (
        lessons.some((l) => inClass(student, l.classId) && l.teacherId === user.id) ||
        classes.some((c) => inClass(student, c.id) && c.homeroomTeacherId === user.id)
      );
  }
}

export function normalizePhone(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.length === 9) return `998${d}`;
  if (d.length === 12 && d.startsWith("998")) return d;
  return null;
}
