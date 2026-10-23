// Fayldagi jadval → "O'quvchi qo'shish" formasi maydonlari (boshqa ustunlar e'tiborsiz).
import { normalizePhone, type CommandMap, type SchoolClass, type Student } from "@edunazorat/shared";

import type { Table } from "./read";

export type Field = "skip" | "name" | "class" | "birthDay" | "parentName" | "parentPhone" | "studentPhone";
export const FIELDS: Field[] = ["name", "class", "birthDay", "parentName", "parentPhone", "studentPhone", "skip"];

const norm = (s: string) => s.toLowerCase().replace(/[ʻʼ'`’‘"]/g, "").replace(/ё/g, "е").replace(/\s+/g, " ").trim();

const PHONE_RE = /(?:\+?998[\s-]?)?\(?\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/;
const DATE_RE = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$|^(\d{4})-(\d{2})-(\d{2})$/;

/** Sarlavha bo'yicha ustun turi (o'zbekcha, ruscha, inglizcha; lotin va kirill). */
export function fieldFromHeader(h: string): Field | null {
  const s = norm(h);
  if (!s) return null;
  if (/^(№|#|n|no|t\/r|т\/р|nomer|номер п\/п|п\/п)$/.test(s)) return "skip";
  const phone = /(tel|телефон|phone|raqam|номер|mobil)/.test(s);
  const student = /(oquvchi|ученик|учащ|talaba|student|bola)/.test(s);
  const parent = /(ota|ona|vasiy|родител|мама|папа|отец|мать|опекун|parent|mother|father)/.test(s);
  if (phone && student && !parent) return "studentPhone";
  if (phone) return "parentPhone";
  if (/(tugil|tugul|рожд|birth|dob)/.test(s)) return "birthDay";
  if (/(sinf|класс|guruh|группа|class|group|grade)/.test(s)) return "class";
  if (parent) return "parentName";
  if (/(fish|fio|фио|familiya|фамилия|ism|имя|oquvchi|ученик|talaba|name)/.test(s)) return "name";
  return null;
}

/** Sarlavha qatori: kamida 2 ta katak sarlavhaga o'xshasa (birinchi 5 qator ichida). */
export function findHeader(rows: Table): number {
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const known = rows[i].filter((c) => { const f = fieldFromHeader(c); return f && f !== "skip"; }).length;
    if (known >= 2) return i;
  }
  return -1;
}

const looksPhone = (v: string) => !!normalizePhone(v) || PHONE_RE.test(v);
const looksDate = (v: string) => DATE_RE.test(v.trim());

/** Sarlavhasiz fayl: ustun mazmuniga qarab taxmin. */
function guessByContent(rows: Table, classes: SchoolClass[], width: number): Field[] {
  const out: Field[] = Array(width).fill("skip");
  const share = (c: number, test: (v: string) => boolean) => {
    const vals = rows.map((r) => r[c] ?? "").filter((v) => v.trim());
    return vals.length ? vals.filter(test).length / vals.length : 0;
  };
  const classKeys = new Set(classes.map((c) => classKey(c.name)));
  let nameCol = -1;
  let best = 0;
  for (let c = 0; c < width; c++) {
    if (share(c, looksPhone) > 0.6) out[c] = out.includes("parentPhone") ? "studentPhone" : "parentPhone";
    else if (share(c, looksDate) > 0.6) out[c] = "birthDay";
    else if (share(c, (v) => classKeys.has(classKey(v))) > 0.5) out[c] = "class";
    else if (share(c, (v) => /^\d+$/.test(v.trim())) > 0.8) out[c] = "skip";
    else {
      const words = share(c, (v) => v.trim().split(/\s+/).length >= 2);
      if (words > best) { best = words; nameCol = c; }
    }
  }
  if (nameCol >= 0) out[nameCol] = "name";
  // Ism ustunidan keyingi matnli ustun — ota-ona ismi
  for (let c = 0; c < width; c++) if (out[c] === "skip" && c !== nameCol && share(c, (v) => /[a-zа-я]/i.test(v)) > 0.6) { out[c] = "parentName"; break; }
  return out;
}

export interface Mapping { headerRow: number; fields: Field[] }

export function guessMapping(rows: Table, classes: SchoolClass[]): Mapping {
  const width = Math.max(0, ...rows.slice(0, 50).map((r) => r.length));
  const h = findHeader(rows);
  if (h >= 0) {
    const fields = Array.from({ length: width }, (_, c) => fieldFromHeader(rows[h][c] ?? "") ?? "skip");
    // Ism ustuni topilmasa (masalan, "Familiyasi" va "Ismi" alohida) — mazmun bo'yicha
    if (!fields.includes("name")) {
      const g = guessByContent(rows.slice(h + 1), classes, width);
      g.forEach((f, c) => { if (fields[c] === "skip" && f === "name") fields[c] = "name"; });
    }
    return { headerRow: h, fields };
  }
  return { headerRow: -1, fields: guessByContent(rows, classes, width) };
}

/** "9-A", "9 a", "9А sinf" → "9a" (kirill A ham lotinga). */
export function classKey(s: string): string {
  return norm(s).replace(/(sinf|класс|guruh|группа)/g, "")
    .replace(/[а]/g, "a").replace(/[б]/g, "b").replace(/[в]/g, "v").replace(/[г]/g, "g").replace(/[д]/g, "d").replace(/[е]/g, "e")
    .replace(/[^a-z0-9]/g, "");
}

/** dd.mm.yyyy, dd/mm/yy, yyyy-mm-dd → YYYY-MM-DD (noto'g'ri bo'lsa null). */
export function parseDay(v: string): string | null {
  const m = DATE_RE.exec(v.trim());
  if (!m) return null;
  const [yy, mo, d] = m[4] ? [Number(m[4]), Number(m[5]), Number(m[6])] : [Number(m[3]), Number(m[2]), Number(m[1])];
  const y = yy < 100 ? yy + (yy > 50 ? 1900 : 2000) : yy;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  if (y < 1940 || y > new Date().getFullYear()) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Katakdagi telefon (matn ichida ham: "Feruza 90 123 45 67"). */
function phoneIn(v: string): { phone: string | null; rest: string } {
  const m = PHONE_RE.exec(v);
  if (!m) return { phone: normalizePhone(v), rest: normalizePhone(v) ? "" : v };
  return { phone: normalizePhone(m[0]), rest: (v.slice(0, m.index) + v.slice(m.index + m[0].length)).replace(/[,;:–-]+/g, " ").trim() };
}

export type RowStatus = "ok" | "warn" | "error" | "duplicate";
export interface ImportRow {
  /** Fayldagi qator raqami (1 dan). */
  line: number;
  status: RowStatus;
  notes: string[];
  input?: CommandMap["student.save"];
  className?: string;
  /** Fayldagi ism (xato qatorda ham ko'rsatish uchun). */
  name?: string;
}

/**
 * Qatorlarni formaga aylantirish va tekshirish. Xato qator qo'shilmaydi; ogohlantirishli qator qo'shiladi
 * (masalan, noto'g'ri telefon tashlab yuboriladi). Sinf faylda bo'lmasa — tanlangan sinf.
 */
export function buildRows(rows: Table, map: Mapping, classes: SchoolClass[], existing: Student[], defaultClassId: string): ImportRow[] {
  const byKey = new Map(classes.map((c) => [classKey(c.name), c]));
  const seen = new Set(existing.filter((s) => !s.archived).map((s) => `${norm(s.name)}|${s.classId}`));
  const out: ImportRow[] = [];
  const col = (f: Field) => map.fields.map((x, i) => (x === f ? i : -1)).filter((i) => i >= 0);
  const nameCols = col("name");
  rows.forEach((r, i) => {
    if (i <= map.headerRow) return;
    if (!r.some((c) => c?.trim())) return;
    const notes: string[] = [];
    const name = nameCols.map((c) => r[c] ?? "").join(" ").replace(/\s+/g, " ").trim();
    // Takrorlangan sarlavha yoki jami qatori (PDF sahifalarida)
    if (!name || fieldFromHeader(name) === "name" || /^(jami|итого|всего)/i.test(name)) return;
    if (name.length < 3 || !/[a-zа-яʻ']/i.test(name)) return void out.push({ line: i + 1, status: "error", notes: ["import.badName"], name });

    const classRaw = col("class").map((c) => r[c] ?? "").find((v) => v.trim()) ?? "";
    const cls = classRaw ? byKey.get(classKey(classRaw)) : classes.find((c) => c.id === defaultClassId);
    if (!cls) return void out.push({ line: i + 1, status: "error", notes: [classRaw ? "import.noClass" : "import.chooseClass"], className: classRaw, name });

    let birthDay: string | undefined;
    const bRaw = col("birthDay").map((c) => r[c] ?? "").find((v) => v.trim());
    if (bRaw) {
      const d = parseDay(bRaw);
      if (d) birthDay = d;
      else notes.push("import.badDate");
    }

    // Ota-onalar: ism va telefon ustunlari tartib bo'yicha juftlanadi (Ota, Ota tel., Ona, Ona tel.)
    const nameVals = col("parentName").map((c) => r[c] ?? "");
    const phoneVals = col("parentPhone").map((c) => r[c] ?? "");
    const parents: { name: string; phone: string }[] = [];
    const n = Math.max(nameVals.length, phoneVals.length);
    for (let k = 0; k < n; k++) {
      const fromName = phoneIn(nameVals[k] ?? "");
      const fromPhone = phoneIn(phoneVals[k] ?? "");
      const phone = fromPhone.phone ?? fromName.phone;
      const pname = (fromName.rest || fromPhone.rest).trim();
      if (!phone) {
        if ((phoneVals[k] ?? "").trim()) notes.push("import.badPhone");
        else if (pname) notes.push("import.parentNoPhone");
        continue;
      }
      if (!parents.some((p) => p.phone === phone)) parents.push({ name: pname || `${name.split(" ")[0]} (ota-onasi)`, phone });
    }
    let studentPhone: string | undefined;
    const sp = col("studentPhone").map((c) => r[c] ?? "").find((v) => v.trim());
    if (sp) {
      const p = normalizePhone(sp);
      if (p) studentPhone = p;
      else notes.push("import.badPhone");
    }
    const key = `${norm(name)}|${cls.id}`;
    if (seen.has(key)) return void out.push({ line: i + 1, status: "duplicate", notes: ["import.exists"], className: cls.name, input: { name, classId: cls.id, parents } });
    seen.add(key);
    out.push({
      line: i + 1, status: notes.length ? "warn" : "ok", notes, className: cls.name,
      input: { name, classId: cls.id, birthDay, parents: parents.slice(0, 4), ...(studentPhone ? { studentPhone } : {}) },
    });
  });
  return out;
}
