"use client";

import { useMemo, useRef, useState } from "react";
import { CircleAlert, CircleCheck, Copy, Download, FileUp, LoaderCircle, TriangleAlert } from "lucide-react";
import type { SchoolClass } from "@edunazorat/shared";

import { errorText } from "@/components/providers";
import { btn, cx, Modal, Pill, Select } from "@/components/ui";
import { useApp } from "@/lib/data/store";
import { exportXlsx } from "@/lib/export";
import { fmt } from "@/lib/format";
import { buildRows, FIELDS, guessMapping, type Field, type ImportRow, type Mapping } from "@/lib/import/map";
import { ImportError, readTable, type Table } from "@/lib/import/read";
import { useT } from "@/lib/i18n/react";

const FIELD_LABEL: Record<Field, string> = {
  name: "Familiya va ism",
  class: "Sinf",
  birthDay: "Tug'ilgan sana",
  parentName: "Ota-ona ismi",
  parentPhone: "Ota-ona telefoni",
  studentPhone: "O'quvchi telefoni",
  skip: "Kerak emas",
};
/** Bir so'rovda (server tranzaksiyasi) shuncha qator. */
const CHUNK = 100;
/** Ko'rib chiqish jadvalida ko'rsatiladigan qatorlar. */
const PREVIEW = 300;

/**
 * O'quvchilarni fayldan qo'shish: Excel (.xlsx), CSV, Word (.docx), PDF. Fayl brauzerda o'qiladi; formadagi
 * maydonlargina olinadi (F.I.Sh, sinf, tug'ilgan sana, ota-ona ismi va telefoni, o'quvchi telefoni).
 */
export function StudentImport({ classes, onClose }: { classes: SchoolClass[]; onClose: () => void }) {
  const app = useApp();
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<string>("");
  const [table, setTable] = useState<Table | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [defaultClass, setDefaultClass] = useState(classes.length === 1 ? classes[0].id : "");
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ added: number; failed?: string } | null>(null);

  const inst = app.myInstitution!;
  const existing = useMemo(() => app.studentsOfInstitution(inst.id, true), [app, inst.id]);
  const rows: ImportRow[] = useMemo(
    () => (table && mapping ? buildRows(table, mapping, classes, existing, defaultClass) : []),
    [table, mapping, classes, existing, defaultClass],
  );
  const importable = rows.filter((r) => (r.status === "ok" || r.status === "warn") && r.input);
  const count = (s: ImportRow["status"]) => rows.filter((r) => r.status === s).length;

  const open = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setResult(null);
    setReading(true);
    try {
      const tb = await readTable(f);
      if (!tb.length) throw new ImportError("err.importEmpty");
      setFile(f.name);
      setTable(tb);
      setMapping(guessMapping(tb, classes));
    } catch (e) {
      setError(e instanceof ImportError ? t(e.message) : t("err.importFile"));
      setTable(null);
    } finally {
      setReading(false);
      if (input.current) input.current.value = "";
    }
  };

  const template = () => void exportXlsx(`${t("O'quvchilar")}_namuna.xlsx`, [{
    name: t("O'quvchilar"),
    rows: [
      ["№", t("Familiya va ism"), t("Sinf"), t("Tug'ilgan sana"), t("Ota-ona ismi"), t("Ota-ona telefoni"), t("O'quvchi telefoni")],
      [1, "Aliyev Jasur", classes[0]?.name ?? "5-A", "12.04.2015", "Aliyeva Malika", "+998 90 123 45 67", ""],
    ],
  }]);

  const run = async () => {
    const list = importable.map((r) => r.input!);
    setProgress({ done: 0, total: list.length });
    let added = 0;
    for (let i = 0; i < list.length; i += CHUNK) {
      const part = list.slice(i, i + CHUNK);
      try {
        await app.run("student.import", { students: part });
        added += part.length;
        setProgress({ done: added, total: list.length });
      } catch (e) {
        // Xato qator raqami shu bo'lak ichida: fayldagi qatorga aylantiramiz
        const msg = errorText(e);
        const rowInChunk = Number((e as { params?: { row?: number } }).params?.row ?? 0);
        const line = rowInChunk ? importable[i + rowInChunk - 1]?.line : undefined;
        setResult({ added, failed: line ? `${t("Fayldagi {n}-qator", { n: line })}: ${msg.replace(/^\d+-qator: |^Строка \d+: /, "")}` : msg });
        setProgress(null);
        return;
      }
    }
    setProgress(null);
    setResult({ added });
  };

  const setField = (c: number, f: Field) => setMapping((m) => (m ? { ...m, fields: m.fields.map((x, i) => (i === c ? f : x)) } : m));
  const header = (c: number) => (mapping && mapping.headerRow >= 0 ? table?.[mapping.headerRow]?.[c] : table?.find((r) => r[c])?.[c]) || `${t("Ustun")} ${c + 1}`;
  const shown = (onlyProblems ? rows.filter((r) => r.status !== "ok") : rows).slice(0, PREVIEW);
  const noName = mapping && !mapping.fields.includes("name");
  const noClass = mapping && !mapping.fields.includes("class") && !defaultClass;

  return (
    <Modal open onClose={onClose} wide title={t("O'quvchilarni fayldan qo'shish")}>
      {result ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          {result.failed ? <CircleAlert size={40} className="text-bad" aria-hidden /> : <CircleCheck size={40} className="text-ok" aria-hidden />}
          <p className="text-lg font-bold">{t("{n} ta o'quvchi qo'shildi", { n: result.added })}</p>
          {result.failed && <p role="alert" className="max-w-md text-sm text-bad">{result.failed}. {t("Shu qatorni tuzatib, faylni qayta yuklang (qo'shilganlar takrorlanmaydi).")}</p>}
          {!result.failed && <p className="max-w-md text-sm text-muted">{t("Ota-onalarga parolni o'quvchi sahifasidan berasiz. Yuz rasmini o'quvchi kartasida qo'shish mumkin.")}</p>}
          <button type="button" className={btn.primary} onClick={onClose}>{t("Yopish")}</button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="text-sm text-muted">
              {t("Excel (.xlsx), CSV, Word (.docx) yoki PDF. Faqat formadagi ma'lumotlar olinadi: familiya va ism, sinf, tug'ilgan sana, ota-ona ismi va telefoni, o'quvchi telefoni. Boshqa ustunlar e'tiborsiz qoldiriladi.")}
            </div>
            <button type="button" className={cx(btn.sm, "self-start")} onClick={template}><Download size={15} aria-hidden /> {t("Namuna fayl")}</button>
          </div>

          <input ref={input} type="file" hidden accept=".xlsx,.xlsm,.csv,.txt,.docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/csv"
            onChange={(e) => void open(e.target.files?.[0])} />
          <button type="button" disabled={reading || !!progress} onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void open(e.dataTransfer.files[0]); }}
            className="flex flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed border-line px-4 py-6 text-center transition hover:border-primary hover:bg-primary-soft/30 disabled:opacity-60">
            {reading ? <LoaderCircle size={26} className="animate-spin text-muted" aria-hidden /> : <FileUp size={26} className="text-primary" aria-hidden />}
            <span className="font-semibold">{file || t("Fayl tanlash yoki shu yerga tashlash")}</span>
            {file && <span className="text-xs text-muted">{t("Boshqa fayl tanlash")}</span>}
          </button>
          {error && <p role="alert" className="text-sm font-medium text-bad">{error}</p>}

          {table && mapping && (
            <>
              <div>
                <div className="mb-1.5 text-sm font-semibold">{t("Ustunlar")}</div>
                <div className="scroll-x">
                  <div className="flex min-w-max gap-2">
                    {mapping.fields.map((f, c) => (
                      <label key={c} className="flex w-44 flex-col gap-1 rounded-xl border border-line p-2 text-xs">
                        <span className="truncate font-medium text-muted" title={header(c)}>{header(c)}</span>
                        <Select value={f} onChange={(v) => setField(c, v as Field)} className="h-9 text-sm" aria-label={t("{col} ustuni", { col: header(c) })}>
                          {FIELDS.map((x) => <option key={x} value={x}>{t(FIELD_LABEL[x])}</option>)}
                        </Select>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {!mapping.fields.includes("class") && (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-semibold">{t("Faylda sinf ko'rsatilmagan: hammasi qaysi sinfga?")}</span>
                  <Select value={defaultClass} onChange={setDefaultClass} className="sm:w-64">
                    <option value="">{t("Sinfni tanlang")}</option>
                    {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </label>
              )}
              {noName && <p className="text-sm font-medium text-bad">{t("\"Familiya va ism\" ustunini belgilang")}</p>}

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Pill tone="ok" icon={CircleCheck}>{t("Tayyor: {n}", { n: count("ok") })}</Pill>
                {count("warn") > 0 && <Pill tone="warn" icon={TriangleAlert}>{t("Izohli: {n}", { n: count("warn") })}</Pill>}
                {count("duplicate") > 0 && <Pill tone="slate" icon={Copy}>{t("Allaqachon bor: {n}", { n: count("duplicate") })}</Pill>}
                {count("error") > 0 && <Pill tone="bad" icon={CircleAlert}>{t("Xato: {n}", { n: count("error") })}</Pill>}
                <label className="ml-auto flex items-center gap-1.5 text-muted">
                  <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} /> {t("Faqat muammolilar")}
                </label>
              </div>

              <div className="scroll-x max-h-[45vh] overflow-y-auto rounded-xl border border-line">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface-2 text-left text-xs text-muted">
                    <tr>
                      <th className="px-3 py-2">{t("Qator")}</th>
                      <th className="px-3 py-2">{t("Holat")}</th>
                      <th className="px-3 py-2">{t("Familiya va ism")}</th>
                      <th className="px-3 py-2">{t("Sinf")}</th>
                      <th className="px-3 py-2">{t("Tug'ilgan sana")}</th>
                      <th className="px-3 py-2">{t("Ota-ona")}</th>
                    </tr>
                  </thead>
                  <tbody className="tabular">
                    {shown.map((r) => (
                      <tr key={r.line} className="border-t border-line align-top">
                        <td className="px-3 py-2 text-muted">{r.line}</td>
                        <td className="min-w-36 px-3 py-2">
                          <span className={cx("font-medium", r.status === "ok" ? "text-ok" : r.status === "warn" ? "text-warn" : r.status === "error" ? "text-bad" : "text-muted")}>
                            {r.status === "ok" ? t("Tayyor") : r.status === "warn" ? t("Izohli") : r.status === "error" ? t("Qo'shilmaydi") : t("Allaqachon bor")}
                          </span>
                          {r.notes.map((n) => <div key={n} className="text-xs text-muted">{t(n, { cls: r.className ?? "" })}</div>)}
                        </td>
                        <td className="px-3 py-2 font-medium">{r.input?.name ?? r.name ?? "—"}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.className ?? "—"}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.input?.birthDay ? r.input.birthDay.split("-").reverse().join(".") : "—"}</td>
                        <td className="px-3 py-2">
                          {r.input?.parents.map((p) => <div key={p.phone} className="whitespace-nowrap">{p.name} · {fmt.phone(p.phone)}</div>)}
                          {r.input?.studentPhone && <div className="text-xs text-muted">{t("O'quvchi")}: {fmt.phone(r.input.studentPhone)}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > PREVIEW && <p className="text-xs text-muted">{t("Jadvalda birinchi {n} qator ko'rsatildi", { n: PREVIEW })}</p>}

              <div className="grid grid-cols-2 gap-2">
                <button type="button" className={btn.outline} onClick={onClose} disabled={!!progress}>{t("Bekor qilish")}</button>
                <button type="button" className={btn.primary} disabled={!importable.length || !!progress || !!noName || !!noClass} onClick={() => void run()}>
                  {progress ? t("Qo'shilmoqda: {done}/{total}", progress) : t("{n} ta o'quvchini qo'shish", { n: importable.length })}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
