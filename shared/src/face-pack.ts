// Yuz namunalari tarmoqda ixcham: 512 ta son JSON'da ~4,5 KB, bu yerda ~0,7 KB (int8 + masshtab).
// Kosinus o'xshashligiga ta'siri ~0,001 (chegara 0,28–0,4 oralig'ida) — amalda sezilmaydi.
// Faqat uzatishda: bazada va xotirada asl sonlar qoladi.
import type { Patch } from "./patch";
import type { Database, Student } from "./types";

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function packTemplate(t: number[]): string {
  let max = 0;
  for (const v of t) max = Math.max(max, Math.abs(v));
  const scale = max || 1;
  const buf = new Uint8Array(4 + t.length);
  new DataView(buf.buffer).setFloat32(0, scale, true);
  for (let i = 0; i < t.length; i++) buf[4 + i] = Math.round((t[i] / scale) * 127) & 0xff;
  return toB64(buf);
}

export function unpackTemplate(s: string): number[] {
  const buf = fromB64(s);
  const scale = new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getFloat32(0, true);
  const q = new Int8Array(buf.buffer, buf.byteOffset + 4, buf.byteLength - 4);
  return Array.from(q, (v) => (v / 127) * scale);
}

type Wire = Student & { faceQ?: string[] };

function packStudent(s: Student): Student {
  if (!s.faceTemplates?.length) return s;
  return { ...s, faceTemplates: [], faceQ: s.faceTemplates.map(packTemplate) } as Wire;
}
function unpackStudent(s: Wire): Student {
  if (!s.faceQ) return s;
  const { faceQ, ...rest } = s;
  return { ...rest, faceTemplates: faceQ.map(unpackTemplate) };
}

/** Server → mijoz: o'quvchilardagi namunalar ixcham ko'rinishda. */
export function packDatabase<T extends Pick<Database, "students">>(db: T): T {
  return db.students.some((s) => s.faceTemplates?.length) ? { ...db, students: db.students.map(packStudent) } : db;
}
export function packPatch(p: Patch): Patch {
  const st = p.upsert?.students;
  return st?.some((s) => s.faceTemplates?.length) ? { ...p, upsert: { ...p.upsert, students: st.map(packStudent) } } : p;
}
/** Mijozda: asl ko'rinishga. */
export function unpackDatabase<T extends Pick<Database, "students">>(db: T): T {
  return db.students?.some((s) => (s as Wire).faceQ) ? { ...db, students: db.students.map((s) => unpackStudent(s as Wire)) } : db;
}
export function unpackPatch(p: Patch): Patch {
  const st = p.upsert?.students;
  return st?.some((s) => (s as Wire).faceQ) ? { ...p, upsert: { ...p.upsert, students: st.map((s) => unpackStudent(s as Wire)) } } : p;
}
