// O'quvchilar ro'yxati fayldan: Excel (.xlsx), CSV, Word (.docx), PDF → jadval (qatorlar x kataklar).
// Hammasi brauzerda o'qiladi: fayl serverga yuborilmaydi, faqat tanlangan maydonlar buyruq bilan ketadi.
import { unzipSync, strFromU8 } from "fflate";

export type Table = string[][];

export class ImportError extends Error {}

const clean = (s: string) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();

function xml(text: string): Document {
  return new DOMParser().parseFromString(text, "application/xml");
}
/** Nom fazosidan qat'i nazar teg bo'yicha (w:tbl, c, si...). */
const tags = (el: Document | Element, name: string) => Array.from(el.getElementsByTagNameNS("*", name));

function unzip(buf: ArrayBuffer): Record<string, Uint8Array> {
  try {
    return unzipSync(new Uint8Array(buf));
  } catch {
    throw new ImportError("err.importFile");
  }
}

// ------------------------------------------------------------------ Excel

/** "B12" → 1 (ustun indeksi). */
function colIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Excel sana raqami (1900 tizimi) → YYYY-MM-DD. */
export function excelDate(serial: number): string {
  const ms = Math.round((serial - 25569) * 86_400_000);
  return new Date(ms).toISOString().slice(0, 10);
}

/** Qaysi uslub (s="…") sana formatida. */
function dateStyles(files: Record<string, Uint8Array>): Set<number> {
  const out = new Set<number>();
  const st = files["xl/styles.xml"];
  if (!st) return out;
  const doc = xml(strFromU8(st));
  const custom = new Map<number, string>();
  for (const f of tags(doc, "numFmt")) custom.set(Number(f.getAttribute("numFmtId")), f.getAttribute("formatCode") ?? "");
  const xfs = tags(doc, "cellXfs")[0];
  if (!xfs) return out;
  tags(xfs, "xf").forEach((xf, i) => {
    const id = Number(xf.getAttribute("numFmtId") ?? 0);
    const code = custom.get(id) ?? "";
    // 14–22, 45–47: o'rnatilgan sana/vaqt formatlari; boshqalari — kodida kun va yil bo'lsa
    if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || (/[dD]/.test(code) && /[yY]/.test(code))) out.add(i);
  });
  return out;
}

export function parseXlsx(buf: ArrayBuffer): Table {
  const files = unzip(buf);
  const sheetPath = Object.keys(files).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a, b) => {
    const n = (s: string) => Number(/(\d+)\.xml$/.exec(s)?.[1] ?? 0);
    return n(a) - n(b);
  })[0];
  if (!sheetPath) throw new ImportError("err.importFile");
  const shared = files["xl/sharedStrings.xml"]
    ? tags(xml(strFromU8(files["xl/sharedStrings.xml"])), "si").map((si) => tags(si, "t").map((t) => t.textContent ?? "").join(""))
    : [];
  const dates = dateStyles(files);
  const doc = xml(strFromU8(files[sheetPath]));
  const rows: Table = [];
  for (const row of tags(doc, "row")) {
    const cells: string[] = [];
    for (const c of tags(row, "c")) {
      const idx = colIndex(c.getAttribute("r") ?? "A");
      const type = c.getAttribute("t");
      const v = tags(c, "v")[0]?.textContent ?? "";
      let text: string;
      if (type === "s") text = shared[Number(v)] ?? "";
      else if (type === "inlineStr") text = tags(c, "t").map((t) => t.textContent ?? "").join("");
      else if (type === "b") text = v === "1" ? "TRUE" : "FALSE";
      else if (!type || type === "n") {
        const num = Number(v);
        text = v !== "" && dates.has(Number(c.getAttribute("s") ?? -1)) && num > 0 && num < 80000 ? excelDate(num) : v;
      } else text = v;
      cells[idx] = clean(text);
    }
    rows.push(Array.from(cells, (x) => x ?? ""));
  }
  return rows;
}

// ------------------------------------------------------------------ CSV / matn

export function parseCsv(text: string): Table {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  // Ajratuvchi: ; (Excel ruscha/o'zbekcha), tab yoki vergul — birinchi qatorda qaysi ko'p bo'lsa
  const counts = [";", "\t", ","].map((d) => ({ d, n: lines[0].split(d).length }));
  const delim = counts.sort((a, b) => b.n - a.n)[0].d;
  return lines.map((line) => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { out.push(clean(cur)); cur = ""; }
      else cur += ch;
    }
    out.push(clean(cur));
    return out;
  });
}

/** Jadvalsiz matn qatori: tab, ";", "|" yoki 2+ bo'shliq bo'yicha bo'linadi. */
function splitLine(line: string): string[] {
  const parts = line.split(/\t|;|\||\s{2,}/).map(clean).filter(Boolean);
  return parts.length ? parts : [clean(line)];
}

// ------------------------------------------------------------------ Word

export function parseDocx(buf: ArrayBuffer): Table {
  const files = unzip(buf);
  const body = files["word/document.xml"];
  if (!body) throw new ImportError("err.importFile");
  const doc = xml(strFromU8(body));
  const rows: Table = [];
  const tables = tags(doc, "tbl");
  if (tables.length) {
    // Ichma-ich jadvallarni ikki marta sanamaslik uchun faqat tashqi jadvallar
    for (const tbl of tables.filter((t) => !t.parentElement?.closest("tbl"))) {
      for (const tr of tags(tbl, "tr")) {
        rows.push(tags(tr, "tc").map((tc) => clean(tags(tc, "p").map((p) => tags(p, "t").map((t) => t.textContent ?? "").join("")).join(" "))));
      }
    }
    return rows;
  }
  // Jadval yo'q: har bir xatboshi — qator
  for (const p of tags(doc, "p")) {
    const line = tags(p, "r").map((r) => [...r.childNodes].map((n) => (n.nodeName.endsWith("tab") ? "\t" : n.textContent ?? "")).join("")).join("");
    if (line.trim()) rows.push(splitLine(line));
  }
  return rows;
}

// ------------------------------------------------------------------ PDF

interface PdfItem { str: string; x: number; y: number; w: number; h: number }

export async function parsePdf(buf: ArrayBuffer): Promise<Table> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf/pdf.worker.min.mjs";
  let pdf;
  try {
    pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  } catch {
    throw new ImportError("err.importFile");
  }
  type Cell = { text: string; x: number };
  const lines: Cell[][] = [];
  for (let p = 1; p <= Math.min(pdf.numPages, 50); p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items: PdfItem[] = [];
    for (const it of content.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const [a, , , d, x, y] = it.transform as number[];
      items.push({ str: it.str, x, y, w: it.width, h: Math.abs(d) || Math.abs(a) || 10 });
    }
    // Qatorlar: y bo'yicha (yuqoridan pastga), yaqin y — bitta qator
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const groups: PdfItem[][] = [];
    for (const it of items) {
      const last = groups.at(-1);
      if (last && Math.abs(last[0].y - it.y) <= Math.max(2, it.h * 0.4)) last.push(it);
      else groups.push([it]);
    }
    for (const g of groups) {
      g.sort((a, b) => a.x - b.x);
      // Kataklar: so'zlar orasidagi katta bo'shliq (shrift balandligidan katta) — yangi ustun
      const cells: Cell[] = [];
      let cur: Cell | null = null;
      let end = -Infinity;
      for (const it of g) {
        if (cur && it.x - end > it.h * 1.2) {
          cells.push(cur);
          cur = null;
        }
        if (!cur) cur = { text: it.str, x: it.x };
        else cur.text += (it.x - end > it.h * 0.15 ? " " : "") + it.str;
        end = it.x + it.w;
      }
      if (cur) cells.push(cur);
      lines.push(cells.map((c) => ({ text: clean(c.text), x: c.x })).filter((c) => c.text));
    }
  }
  // PDF'da bo'sh katak umuman yo'q: ustunlarni sarlavha qatori (eng ko'p katakli) x o'rniga qarab tiklaymiz,
  // aks holda bo'sh katakdan keyingi qiymatlar chapga siljiydi
  const template = lines.slice(0, 30).reduce<Cell[]>((best, l) => (l.length > best.length ? l : best), []);
  const rows: Table = [];
  for (const cells of lines) {
    if (cells.length < 2 || template.length < 2) {
      if (cells.length) rows.push(splitLine(cells.map((c) => c.text).join("  ")));
      continue;
    }
    const row: string[] = Array(template.length).fill("");
    for (const c of cells) {
      let col = 0;
      for (let i = 0; i < template.length; i++) if (template[i].x <= c.x + 4) col = i;
      row[col] = row[col] ? `${row[col]} ${c.text}` : c.text;
    }
    rows.push(row);
  }
  return rows;
}

/** Fayl turi bo'yicha. */
export async function readTable(file: File): Promise<Table> {
  const name = file.name.toLowerCase();
  if (file.size > 10 * 1024 * 1024) throw new ImportError("err.importTooLarge");
  if (/\.(xls|doc)$/.test(name)) throw new ImportError("err.importOldFormat");
  const buf = await file.arrayBuffer();
  if (/\.xlsx$|\.xlsm$/.test(name)) return parseXlsx(buf);
  if (/\.docx$/.test(name)) return parseDocx(buf);
  if (/\.pdf$/.test(name)) return parsePdf(buf);
  if (/\.(csv|txt)$/.test(name)) return parseCsv(new TextDecoder().decode(buf));
  throw new ImportError("err.importType");
}
