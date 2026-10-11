// Katta ro'yxatlarda tez qidirish (davomat yuz minglab yozuv): massiv bo'yicha keshlangan indeks.
// Massiv faqat applyPatch orqali yoki oxiriga push bilan o'zgaradi deb hisoblanadi; boshqacha
// o'zgarsa (qisqarsa, element almashsa) indeks tekshiruvda topiladi va qayta quriladi.

interface Index<T> { len: number; key: (x: T) => string; map: Map<string, number> }

const indexes = new WeakMap<object, Map<string, Index<unknown>>>();

function indexOf<T>(list: T[], name: string, key: (x: T) => string): Index<T> {
  let byName = indexes.get(list);
  if (!byName) indexes.set(list, (byName = new Map()));
  let ix = byName.get(name) as Index<T> | undefined;
  if (!ix || list.length < ix.len) {
    ix = { len: 0, key, map: new Map() };
    byName.set(name, ix as Index<unknown>);
  }
  // Oxiriga qo'shilganlar
  for (let i = ix.len; i < list.length; i++) ix.map.set(key(list[i]), i);
  ix.len = list.length;
  return ix;
}

function rebuild<T>(list: T[], name: string, key: (x: T) => string): Index<T> {
  indexes.get(list)?.delete(name);
  return indexOf(list, name, key);
}

/** Kalit bo'yicha element (yo'q bo'lsa undefined). */
export function lookup<T>(list: T[], name: string, key: (x: T) => string, k: string): T | undefined {
  let ix = indexOf(list, name, key);
  let i = ix.map.get(k);
  if (i !== undefined && (i >= list.length || key(list[i]) !== k)) {
    ix = rebuild(list, name, key);
    i = ix.map.get(k);
  }
  return i === undefined ? undefined : list[i];
}

/** Kalit bo'yicha o'rni (yo'q bo'lsa -1). */
export function positionOf<T>(list: T[], name: string, key: (x: T) => string, k: string): number {
  let ix = indexOf(list, name, key);
  let i = ix.map.get(k);
  if (i !== undefined && (i >= list.length || key(list[i]) !== k)) {
    ix = rebuild(list, name, key);
    i = ix.map.get(k);
  }
  return i ?? -1;
}

/** Guruh indeksi: kalit → o'rinlar (masalan, dars|kun → shu darsdagi ~30 yozuv). Yagona kalitdan ancha kam xotira. */
interface Groups<T> { len: number; key: (x: T) => string; map: Map<string, number[]> }
const groupIndexes = new WeakMap<object, Map<string, Groups<unknown>>>();

function groupsOf<T>(list: T[], name: string, key: (x: T) => string, fresh = false): Groups<T> {
  let byName = groupIndexes.get(list);
  if (!byName) groupIndexes.set(list, (byName = new Map()));
  let g = byName.get(name) as Groups<T> | undefined;
  if (!g || fresh || list.length < g.len) {
    g = { len: 0, key, map: new Map() };
    byName.set(name, g as Groups<unknown>);
  }
  for (let i = g.len; i < list.length; i++) {
    const k = key(list[i]);
    const l = g.map.get(k);
    if (l) l.push(i);
    else g.map.set(k, [i]);
  }
  g.len = list.length;
  return g;
}

/** Kalit bo'yicha guruhdagi elementlar. */
export function lookupGroup<T>(list: T[], name: string, key: (x: T) => string, k: string): T[] {
  let g = groupsOf(list, name, key);
  let pos = g.map.get(k) ?? [];
  if (pos.some((i) => i >= list.length || key(list[i]) !== k)) {
    g = groupsOf(list, name, key, true);
    pos = g.map.get(k) ?? [];
  }
  return pos.map((i) => list[i]);
}

/** Davomat: bir dars-kun guruhi ichidan o'quvchi bo'yicha. */
export const lessonDayKey = (a: { lessonId: string; day: string }) => `${a.lessonId}|${a.day}`;
export function findAttendance<T extends { studentId: string; lessonId: string; day: string }>(list: T[], studentId: string, lessonId: string, day: string): T | undefined {
  return lookupGroup(list, "lessonDay", lessonDayKey, `${lessonId}|${day}`).find((a) => a.studentId === studentId);
}

/**
 * Server yuklangach indekslarni oldindan qurish: birinchi buyruq (masalan, ertalabki davomat)
 * yarim soniya kutmasin.
 */
export function warmIndexes(db: { attendance: { id: string; studentId: string; lessonId: string; day: string }[] } & Record<string, unknown>): void {
  for (const v of Object.values(db)) if (Array.isArray(v) && v.length > 1000) positionOf(v as { id: string }[], "id", (x) => x.id, "");
  lookupGroup(db.attendance, "lessonDay", lessonDayKey, "");
}
