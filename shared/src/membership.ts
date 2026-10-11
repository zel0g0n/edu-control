// O'quvchi qaysi sinf/guruhlarda. Maktabda bitta sinf, o'quv markazida bir nechta guruh.
// "O'quvchi shu sinfdami?" savoli hamma joyda shu yerdagi funksiyalar orqali beriladi.
import type { Enrollment, Institution, InstitutionSettings, Student } from "./types";

/** Hozirgi barcha sinf/guruhlari: asosiy birinchi. */
export function classIdsOf(s: Pick<Student, "classId" | "extraClassIds">): string[] {
  const extra = s.extraClassIds ?? [];
  return extra.length ? [s.classId, ...extra.filter((c) => c !== s.classId)] : [s.classId];
}

export function inClass(s: Pick<Student, "classId" | "extraClassIds">, classId: string): boolean {
  return s.classId === classId || (s.extraClassIds?.includes(classId) ?? false);
}

/** Bildirishnoma kimga: ota-onalar; katta yoshli o'quvchida o'zining akkaunti. */
export function notifyTargets(s: Pick<Student, "parentIds" | "adult" | "userId">): string[] {
  return s.adult && s.userId ? [...new Set([...s.parentIds, s.userId])] : s.parentIds;
}

/**
 * Guruhlar o'zgarganda tarix: yangi guruhga "from: bugun", chiqqanga "to: bugun".
 * Eski yozuvsiz o'quvchi uchun mavjud guruhlar "noma'lum sanadan" (from: "") boshlanadi.
 */
export function updateEnrollments(prev: Enrollment[] | undefined, before: string[], after: string[], day: string): Enrollment[] {
  const list: Enrollment[] = prev?.length ? prev.map((e) => ({ ...e })) : before.map((classId) => ({ classId, from: "" }));
  const open = (c: string) => list.find((e) => e.classId === c && !e.to);
  for (const c of before) if (!after.includes(c)) { const e = open(c); if (e) e.to = day; }
  for (const c of after) if (!open(c)) list.push({ classId: c, from: day });
  return list;
}

export function gradesEnabled(settings?: Pick<InstitutionSettings, "gradesEnabled">): boolean {
  return settings?.gradesEnabled !== false;
}

export function isCenter(inst?: Pick<Institution, "type">): boolean {
  return inst?.type === "center";
}
