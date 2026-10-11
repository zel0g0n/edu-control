"use client";

import { PartyPopper } from "lucide-react";
import { addDays, holidayOn } from "@edunazorat/shared";

import { useApp } from "@/lib/data/store";
import { fmt } from "@/lib/format";
import { useT } from "@/lib/i18n/react";

/** Dam olish kuni haqida eslatma: bugun yoki ertaga bayram/ta'til bo'lsa. */
export function HolidayNote({ institutionId, day, teacher }: { institutionId?: string; day?: string; teacher?: boolean }) {
  const app = useApp();
  const t = useT();
  const settings = institutionId ? app.institution(institutionId)?.settings : undefined;
  const d = day ?? app.today;
  const now = holidayOn(settings, d);
  const next = !day && !now ? holidayOn(settings, addDays(d, 1)) : undefined;
  const h = now ?? next;
  if (!h) return null;
  const range = h.from === h.to ? fmt.date(h.from) : `${fmt.date(h.from)} – ${fmt.date(h.to)}`;
  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-info/30 bg-info/10 px-4 py-3 text-sm">
      <PartyPopper size={18} className="mt-0.5 shrink-0 text-info" aria-hidden />
      <span>
        <b>{now ? t("Dam olish kuni: {name}", { name: h.name }) : t("Ertaga dam olish kuni: {name}", { name: h.name })}</b>
        <span className="block text-muted">
          {range} · {teacher ? t("Darslar o'tkazilmaydi va to'lov hisobida dars soniga kirmaydi. Qo'shimcha dars o'tkazsangiz davomat olishingiz mumkin.") : t("Darslar bo'lmaydi.")}
        </span>
      </span>
    </div>
  );
}
