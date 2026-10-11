"use client";

import type { Invoice, SchoolClass } from "@edunazorat/shared";

import { cx } from "@/components/ui";
import { useApp } from "@/lib/data/store";
import { fmt } from "@/lib/format";
import { useT } from "@/lib/i18n/react";

/** Guruh narxi qisqa: "900 ming/oy", "140 ming/dars", "2,5 mln/kurs". */
export function usePriceLabel() {
  const t = useT();
  return (c: SchoolClass) => {
    const mode = c.billingMode ?? "monthly";
    if (mode === "perLesson") return t("{p}/dars", { p: fmt.moneyShort(c.lessonPrice ?? 0) });
    if (mode === "course") return t("{p}/kurs", { p: fmt.moneyShort(c.coursePrice ?? 0) });
    return t("{p}/oy", { p: fmt.moneyShort(c.monthlyFee) });
  };
}

/** Guruhda to'lov bormi (hisob-varaq yaratish uchun). */
export function hasFee(c: SchoolClass): boolean {
  const mode = c.billingMode ?? "monthly";
  return mode === "perLesson" ? !!c.lessonPrice : mode === "course" ? !!c.coursePrice : c.monthlyFee > 0;
}

/**
 * Hisob-varaq tafsiloti: har guruh narxi va qoldirilgan darslar chegirmasi.
 * Ota-ona "nega shuncha?" deb so'ramasligi uchun.
 */
export function InvoiceLines({ inv, className }: { inv: Invoice; className?: string }) {
  const app = useApp();
  const t = useT();
  if (!inv.lines?.length) return null;
  return (
    <ul className={cx("flex flex-col gap-1 text-xs", className)}>
      {inv.lines.map((l, i) => {
        const cls = app.schoolClass(l.classId);
        const name = cls?.name ?? "—";
        let label: string;
        if (l.kind === "absenceRefund") label = t("Qoldirilgan {n} dars ({g})", { n: l.lessons ?? 0, g: name });
        else if (cls?.billingMode === "perLesson") label = t("{g}: {n} dars × {p}", { g: name, n: l.lessons ?? 0, p: fmt.money(cls.lessonPrice ?? 0) });
        else if (cls?.billingMode === "course") label = t("{g}: kurs to'lovi", { g: name });
        else label = l.partial ? t("{g}: oy o'rtasidan ({n} dars)", { g: name, n: l.lessons ?? 0 }) : name;
        return (
          <li key={i} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 text-muted">{label}</span>
            <span className={cx("tabular shrink-0 font-medium", l.amount < 0 && "text-ok")}>{l.amount < 0 ? "−" : ""}{fmt.money(Math.abs(l.amount))}</span>
          </li>
        );
      })}
    </ul>
  );
}
