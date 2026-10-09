// Kim nimani ko'radi. Server bootstrap va real vaqt yangilanishlarini shu
// qoidalar bilan filtrlaydi: ota-ona faqat o'z farzandini, o'qituvchi faqat
// o'z sinflarini, direktor faqat o'z muassasasini ko'radi.
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
const publicUser = (u: AppUser): AppUser => ({ ...u, phone: "", childIds: [], studentId: undefined });
/** Yuz namunalari faqat davomat oladiganlarga kerak. */
const noFace = (s: Student): Student => ({ ...s, faceTemplates: [], facePhoto: undefined });

export function scopeFor(db: Database, user: AppUser): Scope {
  const mine = when((n: AppNotification) => n.userId === user.id);
  const inst = user.institutionId;

  if (user.role === "superAdmin") {
    return {
      institutions: keep,
      users: when((u) => u.id === user.id || u.role === "director"),
      classes: keep,
      students: (s) => noFace({ ...s, parentIds: [] }),
      lessons: none, terms: none, grades: none, attendance: none, homeworks: none, submissions: none,
      invoices: none, threads: none, messages: none,
      notifications: mine,
    };
  }

  if (user.role === "director") {
    const studentIds = new Set(db.students.filter((s) => s.institutionId === inst).map((s) => s.id));
    const classIds = new Set(db.classes.filter((c) => c.institutionId === inst).map((c) => c.id));
    const hwIds = new Set(db.homeworks.filter((h) => classIds.has(h.classId)).map((h) => h.id));
    return {
      institutions: when((i) => i.id === inst),
      users: when((u) => u.institutionId === inst || u.childIds.some((c) => studentIds.has(c))),
      classes: when((c) => c.institutionId === inst),
      students: when((s) => s.institutionId === inst),
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
    };
  }

  if (user.role === "teacher") {
    const classIds = new Set([
      ...db.lessons.filter((l) => l.teacherId === user.id).map((l) => l.classId),
      ...db.classes.filter((c) => c.homeroomTeacherId === user.id).map((c) => c.id),
    ]);
    const students = db.students.filter((s) => classIds.has(s.classId));
    const studentIds = new Set(students.map((s) => s.id));
    const parentIds = new Set(students.flatMap((s) => s.parentIds));
    const hwIds = new Set(db.homeworks.filter((h) => classIds.has(h.classId)).map((h) => h.id));
    const threadIds = new Set(db.threads.filter((t) => t.teacherId === user.id).map((t) => t.id));
    return {
      institutions: when((i) => i.id === inst, (i) => ({ ...i, settings: { ...i.settings, payments: {} } })),
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
    };
  }

  // Ota-ona va o'quvchi: faqat o'z farzandi / o'zi.
  const childIds = new Set(user.role === "student" ? (user.studentId ? [user.studentId] : []) : user.childIds);
  const children = db.students.filter((s) => childIds.has(s.id));
  const classIds = new Set(children.map((s) => s.classId));
  const instIds = new Set(children.map((s) => s.institutionId));
  const teacherIds = new Set([
    ...db.lessons.filter((l) => classIds.has(l.classId)).map((l) => l.teacherId),
    ...db.classes.filter((c) => classIds.has(c.id) && c.homeroomTeacherId).map((c) => c.homeroomTeacherId!),
  ]);
  const hwIds = new Set(db.homeworks.filter((h) => classIds.has(h.classId)).map((h) => h.id));
  const isParent = user.role === "parent";
  const threadIds = new Set(db.threads.filter((t) => isParent && t.parentId === user.id).map((t) => t.id));
  return {
    institutions: when((i) => instIds.has(i.id), (i) => ({ ...i, settings: { ...i.settings, matchThreshold: 0, reviewThreshold: 0 } })),
    users: (u) => (u.id === user.id ? u : teacherIds.has(u.id) ? publicUser(u) : null),
    classes: when((c) => classIds.has(c.id)),
    students: when((s) => childIds.has(s.id), (s) => ({ ...noFace(s), facePhoto: isParent ? s.facePhoto : undefined, parentIds: isParent ? s.parentIds : [] })),
    lessons: when((l) => classIds.has(l.classId)),
    terms: when((t) => instIds.has(t.institutionId)),
    grades: when((g) => childIds.has(g.studentId)),
    attendance: when((a) => childIds.has(a.studentId), (a) => ({ ...a, matchScore: undefined })),
    homeworks: when((h) => classIds.has(h.classId)),
    submissions: when((s) => hwIds.has(s.homeworkId) && childIds.has(s.studentId)),
    invoices: isParent ? when((i) => childIds.has(i.studentId)) : none,
    threads: when((t) => threadIds.has(t.id)),
    messages: when((m) => threadIds.has(m.threadId)),
    notifications: mine,
  };
}

const COLLECTIONS: CollectionName[] = [
  "institutions", "users", "classes", "students", "lessons", "terms", "grades", "attendance",
  "homeworks", "submissions", "invoices", "threads", "messages", "notifications",
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
  "teacher.save", "teacher.setActive", "institution.save", "institution.setActive", "settings.save", "term.save",
];
