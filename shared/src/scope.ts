// Kim nimani ko'radi. Server bootstrap va real vaqt yangilanishlarini shu
// qoidalar bilan filtrlaydi: ota-ona faqat o'z farzandini, o'qituvchi faqat
// o'z sinflarini, direktor faqat o'z muassasasini ko'radi.
import { branchLimit } from "./branches";
import { addDays } from "./dates";
import { classIdsOf } from "./membership";
import type { CollectionName, Patch } from "./patch";
import type { AppNotification, AppUser, Database, Student } from "./types";

type Item<K extends CollectionName> = Database[K][number];
/** null: ko'rinmaydi; aks holda (ehtimol qisqartirilgan) yozuv. */
type View<K extends CollectionName> = (x: Item<K>) => Item<K> | null;
export type Scope = { [K in CollectionName]: View<K> };

const none = () => null;
const keep = <T>(x: T) => x;
const when = <T>(ok: (x: T) => boolean, map: (x: T) => T = keep) => (x: T) => (ok(x) ? map(x) : null);

/** Begona foydalanuvchining telefonini yashirish. */
const publicUser = (u: AppUser): AppUser => ({ ...u, phone: "", childIds: [], studentId: undefined, pay: undefined, login: undefined });
/** Yuz namunalari faqat davomat oladiganlarga kerak. */
const noFace = (s: Student): Student => ({ ...s, faceTemplates: [], facePhoto: undefined });

export function scopeFor(db: Database, user: AppUser): Scope {
  const mine = when((n: AppNotification) => n.userId === user.id);
  const inst = user.institutionId;

  if (user.role === "superAdmin") {
    return {
      institutions: keep,
      users: when((u) => u.id === user.id || u.role === "director" || u.role === "admin"),
      classes: keep,
      students: (s) => noFace({ ...s, parentIds: [] }),
      lessons: none, terms: none, grades: none, attendance: none, homeworks: none, submissions: none,
      invoices: none, threads: none, messages: none,
      notifications: mine,
      leads: none,
    };
  }

  if (user.role === "director" || user.role === "admin") {
    // Filial administratori: faqat o'z filiali guruhlari va o'quvchilari
    const limit = branchLimit(db, user);
    const studentIds = new Set(db.students.filter((s) => s.institutionId === inst && (!limit || limit.studentOk(s))).map((s) => s.id));
    const classIds = new Set(db.classes.filter((c) => c.institutionId === inst && (!limit || limit.classOk(c))).map((c) => c.id));
    const hwIds = new Set(db.homeworks.filter((h) => classIds.has(h.classId)).map((h) => h.id));
    return {
      institutions: when((i) => i.id === inst),
      users: (u) => {
        if (u.childIds.some((c) => studentIds.has(c))) return limit ? { ...u, childIds: u.childIds.filter((c) => studentIds.has(c)) } : u;
        if (u.institutionId !== inst) return null;
        // Boshqa filial o'quvchisining akkaunti ko'rinmaydi
        if (limit && u.role === "student" && !(u.studentId && studentIds.has(u.studentId))) return null;
        return u;
      },
      classes: when((c) => classIds.has(c.id)),
      students: when((s) => studentIds.has(s.id)),
      lessons: when((l) => classIds.has(l.classId)),
      terms: when((t) => t.institutionId === inst),
      grades: when((g) => studentIds.has(g.studentId)),
      attendance: when((a) => studentIds.has(a.studentId)),
      homeworks: when((h) => classIds.has(h.classId)),
      submissions: when((s) => hwIds.has(s.homeworkId)),
      invoices: when((i) => studentIds.has(i.studentId)),
      // Direktor shaxsiy yozishmalarni o'qimaydi.
      threads: none, messages: none,
      notifications: mine,
      leads: when((l) => l.institutionId === inst),
    };
  }

  if (user.role === "teacher") {
    const classIds = new Set([
      ...db.lessons.filter((l) => l.teacherId === user.id).map((l) => l.classId),
      ...db.classes.filter((c) => c.homeroomTeacherId === user.id).map((c) => c.id),
    ]);
    const students = db.students.filter((s) => classIdsOf(s).some((c) => classIds.has(c)));
    const studentIds = new Set(students.map((s) => s.id));
    // Ota-onalar va katta yoshli o'quvchilarning o'z akkauntlari (yozishma uchun)
    const parentIds = new Set(students.flatMap((s) => (s.adult && s.userId ? [...s.parentIds, s.userId] : s.parentIds)));
    const hwIds = new Set(db.homeworks.filter((h) => classIds.has(h.classId)).map((h) => h.id));
    const threadIds = new Set(db.threads.filter((t) => t.teacherId === user.id).map((t) => t.id));
    return {
      institutions: when((i) => i.id === inst, (i) => ({ ...i, settings: { ...i.settings, payments: {}, nvr: undefined } })),
      users: (u) => (u.id === user.id ? u : u.institutionId === inst && u.role === "teacher" ? publicUser(u) : parentIds.has(u.id) ? { ...u, childIds: u.childIds.filter((c) => studentIds.has(c)) } : null),
      classes: when((c) => c.institutionId === inst),
      students: when((s) => studentIds.has(s.id)),
      lessons: when((l) => db.classes.some((c) => c.id === l.classId && c.institutionId === inst)),
      terms: when((t) => t.institutionId === inst),
      grades: when((g) => studentIds.has(g.studentId)),
      attendance: when((a) => studentIds.has(a.studentId)),
      homeworks: when((h) => classIds.has(h.classId)),
      submissions: when((s) => hwIds.has(s.homeworkId)),
      invoices: none,
      threads: when((t) => t.teacherId === user.id),
      messages: when((m) => threadIds.has(m.threadId)),
      notifications: mine,
      leads: none,
    };
  }

  // Ota-ona va o'quvchi: faqat o'z farzandi / o'zi.
  const childIds = new Set(user.role === "student" ? (user.studentId ? [user.studentId] : []) : user.childIds);
  const children = db.students.filter((s) => childIds.has(s.id));
  const classIds = new Set(children.flatMap((s) => classIdsOf(s)));
  const instIds = new Set(children.map((s) => s.institutionId));
  const teacherIds = new Set([
    ...db.lessons.filter((l) => classIds.has(l.classId)).map((l) => l.teacherId),
    ...db.classes.filter((c) => classIds.has(c.id) && c.homeroomTeacherId).map((c) => c.homeroomTeacherId!),
  ]);
  const hwIds = new Set(db.homeworks.filter((h) => classIds.has(h.classId)).map((h) => h.id));
  const isParent = user.role === "parent";
  // Katta yoshli o'quvchi (o'quv markazi) o'z to'lovlarini ham ko'radi: ota-onasi yo'q
  const adultSelf = !isParent && children.some((s) => s.adult);
  // Katta yoshli o'quvchi o'qituvchi bilan o'zi yozishadi
  const threadIds = new Set(db.threads.filter((t) => (isParent || adultSelf) && t.parentId === user.id).map((t) => t.id));
  return {
    institutions: when((i) => instIds.has(i.id), (i) => ({ ...i, settings: { ...i.settings, matchThreshold: 0, reviewThreshold: 0, nvr: undefined } })),
    users: (u) => (u.id === user.id ? u : teacherIds.has(u.id) ? publicUser(u) : null),
    classes: when((c) => classIds.has(c.id)),
    students: when((s) => childIds.has(s.id), (s) => ({ ...noFace(s), facePhoto: isParent ? s.facePhoto : undefined, parentIds: isParent ? s.parentIds : [] })),
    lessons: when((l) => classIds.has(l.classId)),
    terms: when((t) => instIds.has(t.institutionId)),
    grades: when((g) => childIds.has(g.studentId)),
    attendance: when((a) => childIds.has(a.studentId), (a) => ({ ...a, matchScore: undefined })),
    homeworks: when((h) => classIds.has(h.classId)),
    submissions: when((s) => hwIds.has(s.homeworkId) && childIds.has(s.studentId)),
    invoices: isParent || adultSelf ? when((i) => childIds.has(i.studentId)) : none,
    threads: when((t) => threadIds.has(t.id)),
    messages: when((m) => threadIds.has(m.threadId)),
    notifications: mine,
    leads: none,
  };
}

const COLLECTIONS: CollectionName[] = [
  "institutions", "users", "classes", "students", "lessons", "terms", "grades", "attendance",
  "homeworks", "submissions", "invoices", "threads", "messages", "notifications", "leads",
];

function filterList<K extends CollectionName>(scope: Scope, name: K, list: Item<K>[]): Item<K>[] {
  const view = scope[name] as View<K>;
  const out: Item<K>[] = [];
  for (const x of list) {
    const v = view(x);
    if (v) out.push(v);
  }
  return out;
}

/** Foydalanuvchiga yuboriladigan baza nusxasi. */
export function scopeDatabase(db: Database, user: AppUser): Database {
  const scope = scopeFor(db, user);
  const out = { version: db.version, seq: db.seq } as Database;
  for (const name of COLLECTIONS) (out as unknown as Record<string, unknown>)[name] = filterList(scope, name, db[name] as never);
  return out;
}

/** Patchning shu foydalanuvchi ko'radigan qismi (db: patch qo'llangan holat). */
export function scopePatch(db: Database, user: AppUser, patch: Patch): Patch {
  const scope = scopeFor(db, user);
  const upsert: Patch["upsert"] = {};
  for (const [name, items] of Object.entries(patch.upsert ?? {}) as [CollectionName, never[]][]) {
    const list = filterList(scope, name, items);
    if (list.length) (upsert as Record<string, unknown>)[name] = list;
  }
  const out: Patch = {};
  if (Object.keys(upsert).length) out.upsert = upsert;
  if (patch.remove && Object.values(patch.remove).some((l) => l?.length)) out.remove = patch.remove;
  return out;
}

export function isEmptyPatch(p: Patch): boolean {
  return !p.upsert && !p.remove;
}

/**
 * Ko'rinish qoidalarini o'zgartiradigan buyruqlar (yangi dars, sinf, o'quvchi
 * ko'chishi...): boshqa foydalanuvchilar bazani qayta yuklashi kerak.
 */
export const STRUCTURAL_COMMANDS: readonly string[] = [
  "lesson.save", "lesson.delete", "class.save", "class.delete", "student.save", "student.archive",
  "teacher.save", "teacher.setActive", "admin.save", "institution.save", "institution.setActive", "settings.save", "term.save", "nvr.configure",
];

/** Rahbariyat va o'qituvchiga boshlang'ich yuklashda davomat shuncha kunlik (bosh sahifa, 30 kunlik ko'rsatkichlar). */
export const ATTENDANCE_WINDOW_DAYS = 35;

/**
 * Boshlang'ich yuklash: ko'rinish qoidalari + katta muassasada davomat oynasi. Maktabda davomat har kuni
 * o'quvchi x dars yozuvi (800 o'quvchida yiliga ~1,5 mln): direktor brauzeriga hammasini yuborish shart emas.
 * Ota-ona va o'quvchida faqat o'z farzandi — to'liq.
 */
export function bootstrapFor(db: Database, user: AppUser, today: string): Database {
  const out = scopeDatabase(db, user);
  if (user.role === "parent" || user.role === "student") return out;
  const from = addDays(today, -ATTENDANCE_WINDOW_DAYS);
  if (!out.attendance.some((a) => a.day < from)) return out;
  return { ...out, attendance: out.attendance.filter((a) => a.day >= from), attendanceFrom: from };
}

/** Oynadan oldingi davomat (hisobotlar, oylik hisob-kitob, o'quvchi tarixi). */
export function attendanceBetween(db: Database, user: AppUser, from: string, to: string) {
  return filterList(scopeFor(db, user), "attendance", db.attendance.filter((a) => a.day >= from && a.day <= to) as never) as Database["attendance"];
}

/** Foydalanuvchi shu o'quvchini ko'ra oladimi (yuz kesimi fayllari uchun). */
export function canSeeStudent(db: Database, user: AppUser): (studentId: string) => boolean {
  const scope = scopeFor(db, user);
  return (id) => {
    const s = db.students.find((x) => x.id === id);
    return !!s && scope.students(s) !== null;
  };
}
