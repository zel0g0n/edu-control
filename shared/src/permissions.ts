import type { AppUser, Lesson, SchoolClass, Student } from "./types";

/** Direktor: faqat o'z muassasasi. */
export function canManageInstitution(user: AppUser, institutionId: string): boolean {
  return user.role === "superAdmin" || (user.role === "director" && user.institutionId === institutionId);
}

/** O'qituvchi o'zi o'tadigan darsda davomat oladi va baho qo'yadi; direktor ham mumkin. */
export function canTeachLesson(user: AppUser, lesson: Lesson, cls: SchoolClass): boolean {
  if (user.role === "director") return user.institutionId === cls.institutionId;
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
      return user.institutionId === student.institutionId;
    case "parent":
      return user.childIds.includes(student.id);
    case "student":
      return user.studentId === student.id;
    case "teacher":
      return (
        lessons.some((l) => l.classId === student.classId && l.teacherId === user.id) ||
        classes.some((c) => c.id === student.classId && c.homeroomTeacherId === user.id)
      );
  }
}

export function normalizePhone(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.length === 9) return `998${d}`;
  if (d.length === 12 && d.startsWith("998")) return d;
  return null;
}
