"use client";

import { Plus } from "lucide-react";
import { DEFAULT_SLOTS, isoWeekday, type Lesson } from "@edunazorat/shared";

import { useApp } from "@/lib/data/store";
import { weekdayName, weekdayShort } from "@/lib/format";
import { useT } from "@/lib/i18n/react";
import { cx } from "../ui";

/** Fan nomidan barqaror rang (jadvalda ajralib turishi uchun). */
const HUES = [222, 158, 32, 280, 350, 190, 95, 12];
export function subjectHue(subject: string): number {
  let h = 0;
  for (const ch of subject) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
}

/**
 * Haftalik jadval: qatorlar = dars soatlari, ustunlar = kunlar.
 * Bo'sh katakni bosib dars qo'shiladi, darsni bosib tahrirlanadi.
 */
export function ScheduleGrid({
  lessons, mode, onEdit, onAdd,
}: {
  lessons: Lesson[];
  mode: "class" | "teacher";
  onEdit?: (l: Lesson) => void;
  onAdd?: (weekday: number, slot: [string, string]) => void;
}) {
  const app = useApp();
  const t = useT();
  const today = isoWeekday(app.today);
  const slots = [...new Map([...DEFAULT_SLOTS, ...lessons.map((l) => [l.start, l.end] as [string, string])].map((s) => [s[0], s])).values()]
    .sort((a, b) => a[0].localeCompare(b[0]));
  const days = [1, 2, 3, 4, 5, 6];

  return (
    <div className="scroll-x rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[760px] table-fixed border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="w-20 border-b border-line px-3 py-2.5 text-left text-[11px] font-semibold text-muted uppercase">{t("Vaqt")}</th>
            {days.map((d) => (
              <th key={d} className={cx("border-b border-line px-2 py-2.5 text-center text-[13px] font-semibold", d === today ? "text-primary" : "text-muted")}>
                <span className="hidden lg:inline">{weekdayName(d)}</span><span className="lg:hidden">{weekdayShort(d)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slots.map(([start, end]) => (
            <tr key={start}>
              <td className="tabular border-b border-line px-3 py-1.5 align-top text-xs text-muted">
                <div className="font-semibold text-ink">{start}</div>{end}
              </td>
              {days.map((d) => {
                const here = lessons.filter((l) => l.weekday === d && l.start === start);
                return (
                  <td key={d} className={cx("border-b border-l border-line p-1 align-top", d === today && "bg-primary-soft/25")}>
                    <div className="flex min-h-14 flex-col gap-1">
                      {here.map((l) => {
                        const hue = subjectHue(l.subject);
                        return (
                          <button key={l.id} type="button" onClick={() => onEdit?.(l)} disabled={!onEdit}
                            className="rounded-lg border-l-[3px] px-2 py-1.5 text-left transition enabled:hover:brightness-95"
                            style={{ borderLeftColor: `hsl(${hue} 60% 48%)`, background: `hsl(${hue} 70% 50% / 0.1)` }}>
                            <div className="truncate text-[13px] font-semibold">{mode === "teacher" ? app.schoolClass(l.classId)?.name : l.subject}</div>
                            <div className="truncate text-[11px] text-muted">
                              {mode === "teacher" ? l.subject : app.userById(l.teacherId)?.name.split(" ").slice(0, 2).reverse().join(" ")} · {l.room}
                            </div>
                            {l.end !== end && <div className="tabular text-[10px] text-muted">{l.start}–{l.end}</div>}
                          </button>
                        );
                      })}
                      {here.length === 0 && onAdd && (
                        <button type="button" onClick={() => onAdd(d, [start, end])} aria-label={t("{d}, {s}: dars qo'shish", { d: weekdayName(d), s: start })}
                          className="flex min-h-14 flex-1 items-center justify-center rounded-lg text-muted/0 transition hover:bg-surface-2 hover:text-muted focus-visible:text-muted">
                          <Plus size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
