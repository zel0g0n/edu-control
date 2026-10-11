// Filialga biriktirilgan administrator: faqat o'z filiali guruhlarini, o'quvchilarini,
// to'lovlarini ko'radi va o'zgartiradi. Filialsiz guruhlar (umumiy) hammaga ochiq.
import { classIdsOf } from "./membership";
import { CommandError, type Patch } from "./patch";
import type { AppUser, Database, SchoolClass, Student } from "./types";

export interface BranchLimit {
  branchIds: Set<string>;
  /** Ko'rinadigan guruhlar. */
  classIds: Set<string>;
  classOk(c: Pick<SchoolClass, "branchId"> | undefined): boolean;
  studentOk(s: Pick<Student, "classId" | "extraClassIds">): boolean;
}

/** null: cheklov yo'q (direktor, filialsiz administrator yoki muassasada filial yo'q). */
export function branchLimit(db: Pick<Database, "classes" | "institutions">, user: AppUser): BranchLimit | null {
  if (user.role !== "admin" || !user.branchIds?.length || !user.institutionId) return null;
  const inst = db.institutions.find((i) => i.id === user.institutionId);
  const existing = new Set((inst?.settings.branches ?? []).map((b) => b.id));
  const branchIds = new Set(user.branchIds.filter((b) => existing.has(b)));
  if (!branchIds.size) return null;
  const classOk = (c: Pick<SchoolClass, "branchId"> | undefined) => !!c && (!c.branchId || branchIds.has(c.branchId));
  const classIds = new Set(db.classes.filter((c) => c.institutionId === user.institutionId && classOk(c)).map((c) => c.id));
  return { branchIds, classIds, classOk, studentOk: (s) => classIdsOf(s).some((c) => classIds.has(c)) };
}

const forbid = () => {
  throw new CommandError("err.branchForbidden", {}, 403);
};

/**
 * Buyruq natijasini tekshiradi: filial administratori boshqa filial ma'lumotini
 * o'zgartira olmaydi. Handlerlar o'zgarmaydi, tekshiruv bitta joyda.
 */
export function guardBranchPatch(db: Database, limit: BranchLimit, patch: Patch): void {
  const up = patch.upsert ?? {};
  const rm = patch.remove ?? {};
  for (const c of up.classes ?? []) {
    const prev = db.classes.find((x) => x.id === c.id);
    if (!limit.classOk(c) || (prev && !limit.classOk(prev))) forbid();
  }
  for (const id of rm.classes ?? []) if (!limit.classOk(db.classes.find((x) => x.id === id))) forbid();
  for (const s of up.students ?? []) {
    const prev = db.students.find((x) => x.id === s.id);
    const before = prev ? classIdsOf(prev) : [];
    const after = classIdsOf(s);
    // Qo'shilgan yoki olib tashlangan guruh o'z filialida bo'lsin; boshqa filialdagi guruhlar tegilmaydi
    const changed = [...after.filter((c) => !before.includes(c)), ...before.filter((c) => !after.includes(c))];
    if (changed.some((c) => !limit.classIds.has(c))) forbid();
    if (!limit.studentOk(s) && !(prev && limit.studentOk(prev))) forbid();
  }
  const lessonOk = (classId: string) => limit.classIds.has(classId);
  for (const l of up.lessons ?? []) {
    const prev = db.lessons.find((x) => x.id === l.id);
    if (!lessonOk(l.classId) || (prev && !lessonOk(prev.classId))) forbid();
  }
  for (const id of rm.lessons ?? []) {
    const l = db.lessons.find((x) => x.id === id);
    if (l && !lessonOk(l.classId)) forbid();
  }
  const studentById = (id: string) => db.students.find((x) => x.id === id) ?? up.students?.find((x) => x.id === id);
  const visible = (studentId: string) => { const s = studentById(studentId); return !!s && limit.studentOk(s); };
  for (const i of up.invoices ?? []) if (!visible(i.studentId)) forbid();
  for (const g of up.grades ?? []) if (!visible(g.studentId)) forbid();
  for (const a of up.attendance ?? []) if (!visible(a.studentId)) forbid();
  // Muassasa sozlamalari (filiallar, to'lov, NVR) butun markazga tegishli
  if (up.institutions?.length) forbid();
}
