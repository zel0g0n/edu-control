"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { daysBetween, isoWeekday, suggestTermGrade, weightedAverage, type Student, type Term } from "@edunazorat/shared";

import { useApp } from "@/lib/data/store";
import { exportXlsx } from "@/lib/export";
import { fmt, gradeComment, termLabel, weekdayShort } from "@/lib/format";
import { useT } from "@/lib/i18n/react";
import { useRun } from "../providers";
import { avgTone, btn, cx, GradeBadge, toneText } from "../ui";
import { GradeModal } from "./grade-modal";

/**
 * Elektron jurnal: o'quvchilar × dars kunlari. Katakda davomat belgisi va
 * baholar, oxirida o'rtacha va chorak bahosi.
 */
export function Journal({ classId, subject, term, editable }: { classId: string; subject: string; term: Term; editable: boolean }) {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const scroller = useRef<HTMLDivElement>(null);
  const [cell, setCell] = useState<{ student: Student; day: string; lessonId?: string } | null>(null);
  const students = app.studentsOfClass(classId);
  const lessons = app.lessonsOfClass(classId).filter((l) => l.subject === subject);
  const lessonDays = new Set(lessons.map((l) => l.weekday));
  const end = term.endDay < app.today ? term.endDay : app.today;
  const gradeDays = new Set(
    students.flatMap((s) => app.gradesOfStudent(s.id, { subject, from: term.startDay, to: end }).map((g) => g.day)),
  );
  const days = term.startDay > app.today ? [] : daysBetween(term.startDay, end).filter((d) => lessonDays.has(isoWeekday(d)) || gradeDays.has(d));

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [classId, subject, term.id]);

  const lessonOn = (d: string) => lessons.find((l) => l.weekday === isoWeekday(d));

  const download = () => {
    const header = [t("O'quvchi"), ...days.map((d) => fmt.dateShort(d)), t("O'rtacha"), t("Chorak")];
    const rows = students.map((s) => {
      const gs = app.gradesOfStudent(s.id, { subject, from: term.startDay, to: term.endDay });
      const avg = weightedAverage(gs);
      return [
        s.name,
        ...days.map((d) => {
          const l = lessonOn(d);
          const rec = l ? app.attendanceRecord(s.id, l.id, d) : undefined;
          const marks = gs.filter((g) => g.day === d).map((g) => String(g.value)).join(" ");
          const att = rec?.status === "absent" ? t("yo'q") : rec?.status === "excused" ? t("sab.") : rec?.status === "late" ? t("kech") : "";
          return [marks, att].filter(Boolean).join(" ");
        }),
        avg === null ? "" : Number(avg.toFixed(2)),
        app.finalGrade(s.id, subject, term.id)?.value ?? "",
      ];
    });
    void exportXlsx(`${app.schoolClass(classId)?.name}_${subject}_${termLabel(term.name)}.xlsx`, [{ name: subject.slice(0, 30), rows: [header, ...rows] }]);
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2 px-1 text-xs text-muted">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span><b className="text-bad">{t("yo'q")}</b> {t("— kelmagan")}</span>
          <span><b className="text-warn">{t("kech")}</b> {t("— kechikkan")}</span>
          <span className="flex items-center gap-1"><span className="size-3 rounded bg-ok" />{t("nazorat ishi")}</span>
        </span>
        <button type="button" className={btn.sm} onClick={download}><Download size={15} aria-hidden /> Excel</button>
      </div>
      <div ref={scroller} className="scroll-x rounded-2xl border border-line bg-surface">
        <table className="tabular border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-44 border-b border-line bg-surface py-2 pr-3 pl-4 text-left text-[12px] font-semibold text-muted uppercase">{t("O'quvchi")}</th>
              {days.map((d) => (
                <th key={d} className={cx("min-w-12 border-b border-line px-1 py-2 text-center text-[11px] font-medium", d === app.today ? "text-primary" : "text-muted")}>
                  <div>{weekdayShort(isoWeekday(d))}</div>
                  <div className="font-semibold">{fmt.dateShort(d)}</div>
                </th>
              ))}
              <th className="sticky right-[64px] z-10 min-w-16 border-b border-l border-line bg-surface px-2 py-2 text-center text-[11px] font-semibold text-muted uppercase">{t("O'rt.")}</th>
              <th className="sticky right-0 z-10 min-w-16 border-b border-line bg-surface px-2 py-2 text-center text-[11px] font-semibold text-muted uppercase">{t("Chorak")}</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const gs = app.gradesOfStudent(s.id, { subject, from: term.startDay, to: term.endDay });
              const avg = weightedAverage(gs);
              const final = app.finalGrade(s.id, subject, term.id);
              const suggestion = suggestTermGrade(avg);
              return (
                <tr key={s.id} className="group">
                  <th scope="row" className="sticky left-0 z-10 border-b border-line bg-surface py-1.5 pr-3 pl-4 text-left font-medium whitespace-nowrap group-hover:bg-surface-2">
                    {s.name}
                  </th>
                  {days.map((d) => {
                    const l = lessonOn(d);
                    const rec = l ? app.attendanceRecord(s.id, l.id, d) : undefined;
                    const cellGrades = gs.filter((g) => g.day === d);
                    const absent = rec?.status === "absent" || rec?.status === "excused";
                    return (
                      <td key={d} className={cx("border-b border-line p-0 text-center group-hover:bg-surface-2/60", d === app.today && "bg-primary-soft/40")}>
                        <button type="button" disabled={!editable} onClick={() => setCell({ student: s, day: d, lessonId: l?.id })}
                          aria-label={`${s.name}, ${fmt.date(d)}`}
                          className="flex min-h-11 w-full flex-wrap items-center justify-center gap-0.5 px-1 py-1 enabled:hover:bg-primary-soft/60">
                          {cellGrades.map((g) => <GradeBadge key={g.id} value={g.value} type={g.type} comment={g.comment} size={24} title={`${t(`grade.type.${g.type}`)}${g.comment ? ` · ${gradeComment(g.comment)}` : ""}`} />)}
                          {absent && <span className={cx("text-[11px] font-bold", rec.status === "absent" ? "text-bad" : "text-slate")}>{rec.status === "absent" ? t("yo'q") : t("sab.")}</span>}
                          {rec?.status === "late" && cellGrades.length === 0 && <span className="text-[11px] font-bold text-warn">{t("kech")}</span>}
                        </button>
                      </td>
                    );
                  })}
                  <td className={cx("sticky right-[64px] z-10 border-b border-l border-line bg-surface px-2 text-center font-bold group-hover:bg-surface-2", toneText(avgTone(avg)))}>
                    {avg === null ? "—" : fmt.number(avg, 2)}
                  </td>
                  <td className="sticky right-0 z-10 border-b border-line bg-surface px-1.5 text-center group-hover:bg-surface-2">
                    {editable ? (
                      <select value={final?.value ?? ""} aria-label={t("{name}: chorak bahosi", { name: s.name })}
                        onChange={(e) => run(() => app.run("grade.setFinal", { studentId: s.id, subject, termId: term.id, type: "term", value: e.target.value ? Number(e.target.value) : null }))}
                        className={cx("h-9 w-14 rounded-lg border text-center font-bold", final ? "border-transparent bg-ink text-bg" : "border-dashed border-line bg-surface text-muted")}>
                        <option value="">{suggestion ? `≈${suggestion}` : "—"}</option>
                        {[5, 4, 3, 2].map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    ) : final ? <GradeBadge value={final.value} type="term" size={30} /> : <span className="text-muted">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {days.length === 0 && <p className="p-6 text-center text-sm text-muted">{t("Bu chorakda hali dars bo'lmagan")}</p>}
      </div>
      {editable && <p className="mt-2 px-1 text-xs text-muted">{t("Katakni bosib baho qo'ying. Chorak bahosi ustunidagi ≈ belgisi o'rtachaga ko'ra taklif.")}</p>}
      {cell && <GradeModal student={cell.student} subject={subject} day={cell.day} lessonId={cell.lessonId} onClose={() => setCell(null)} />}
    </div>
  );
}
