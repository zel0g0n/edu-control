"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Download, HandCoins, Pencil, Users } from "lucide-react";
import { addMonths, holidayDays, payrollFor, type AppUser, type PayrollRow } from "@edunazorat/shared";

import { TeacherForm } from "@/components/director/forms";
import { PageBody, PageHeader } from "@/components/shell";
import { Avatar, btn, Card, DataTable, EmptyState, Pill, StatCard } from "@/components/ui";
import { useAttendanceFrom } from "@/lib/data/history";
import { useApp } from "@/lib/data/store";
import { exportXlsx } from "@/lib/export";
import { fmt } from "@/lib/format";
import { useT } from "@/lib/i18n/react";

/**
 * O'qituvchi ulushi: oy bo'yicha o'tilgan darslar, guruhlardan tushgan pul va hisoblangan summa.
 * Hisob-kitob shared/payroll.ts da; bu sahifa faqat ko'rsatadi (to'lov tizimdan tashqarida beriladi).
 */
export default function PayrollPage() {
  const app = useApp();
  const t = useT();
  const inst = app.myInstitution!;
  const [month, setMonth] = useState(app.currentMonth());
  const [edit, setEdit] = useState<AppUser | null>(null);
  const teachers = app.teachersOfInstitution(inst.id);
  const classIds = new Set(app.classesOfInstitution(inst.id).map((c) => c.id));
  const lessons = app.db.lessons.filter((l) => classIds.has(l.classId));
  // O'tgan oylar: boshlang'ich yuklashdagi 35 kundan eskisi serverdan olinadi
  const ready = useAttendanceFrom(`${month}-01`);
  const input = {
    lessons,
    attendance: app.db.attendance.filter((a) => a.day.startsWith(month)),
    invoices: app.invoicesOfInstitution(inst.id).filter((i) => i.month === month),
    students: app.studentsOfInstitution(inst.id),
    holidays: holidayDays(inst.settings),
  };
  // Kelgusi oy uchun "bugun" oy oxiri emas: hali dars o'tilmagan
  const rows = teachers.map((u) => ({ u, r: payrollFor(u, month, app.today, input) }));
  const total = rows.reduce((s, x) => s + x.r.payout, 0);
  const lessonsHeld = rows.reduce((s, x) => s + x.r.conducted, 0);
  const noPay = rows.filter((x) => !x.r.mode).length;
  const className = (id: string) => app.schoolClass(id)?.name ?? "—";

  const modeLabel = (r: PayrollRow) =>
    r.mode === "percent" ? t("{v}% tushumdan", { v: r.value ?? 0 })
      : r.mode === "perLesson" ? t("{v} / dars", { v: fmt.money(r.value ?? 0) })
        : r.mode === "fixed" ? t("Oylik {v}", { v: fmt.money(r.value ?? 0) })
          : null;

  const download = () => {
    const header = [t("O'qituvchi"), t("Ish haqi turi"), t("Jadvaldagi darslar"), t("O'tilgan darslar"), t("Guruhlardan tushum (ulush)"), t("Hisoblandi")];
    const detail = [t("O'qituvchi"), t("Guruh"), t("Ulush"), t("Guruhga tushgan"), t("O'qituvchi ulushiga")];
    void exportXlsx(`${t("O'qituvchi ulushi")}_${month}.xlsx`, [
      { name: t("Jami"), rows: [header, ...rows.map(({ u, r }) => [u.name, modeLabel(r) ?? "—", r.scheduled, r.conducted, r.base, r.payout])] },
      { name: t("Guruhlar"), rows: [detail, ...rows.flatMap(({ u, r }) => r.groups.map((g) => [u.name, className(g.classId), `${Math.round(g.share * 100)}%`, g.collected, Math.round(g.collected * g.share)]))] },
    ]);
  };

  return (
    <>
      <PageHeader title={t("O'qituvchi ulushi")}
        actions={<button type="button" className={btn.sm} onClick={download}><Download size={15} aria-hidden /> Excel</button>}
        below={
          <div className="flex items-center gap-1">
            <button type="button" className={btn.icon} onClick={() => setMonth(addMonths(month, -1))} aria-label={t("Oldingi oy")}><ChevronLeft size={20} /></button>
            <span className="min-w-36 text-center font-semibold">{fmt.month(month)}</span>
            <button type="button" className={btn.icon} onClick={() => setMonth(addMonths(month, 1))} aria-label={t("Keyingi oy")}><ChevronRight size={20} /></button>
          </div>
        } />
      <PageBody>
        {!ready && <p className="mb-3 text-sm text-muted" aria-live="polite">{t("Eski davomat ma'lumotlari yuklanmoqda…")}</p>}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard label={t("Jami hisoblandi")} value={fmt.moneyShort(total)} icon={HandCoins} tone="primary" caption={t("{n} o'qituvchi", { n: teachers.length })} />
          <StatCard label={t("O'tilgan darslar")} value={String(lessonsHeld)} icon={Users} caption={t("davomat olingan darslar")} />
          {noPay > 0 && <StatCard label={t("Ish haqi ko'rsatilmagan")} value={String(noPay)} icon={Pencil} tone="warn" caption={t("O'qituvchini tahrirlab kiriting")} />}
        </div>
        <p className="mt-3 text-sm text-muted">
          {t("Foiz: o'qituvchi dars beradigan guruhlarning shu oy hisob-varaqlaridan to'langan pul × uning guruhdagi darslar ulushi × foiz. Darsbay: davomat olingan darslar soni × dars narxi.")}
        </p>
        <div className="mt-4">
          <DataTable rows={rows} rowKey={(x) => x.u.id} initialSort={{ key: "pay", dir: -1 }}
            empty={<Card><EmptyState icon={Users} title={t("O'qituvchi yo'q")} /></Card>}
            columns={[
              { key: "name", header: t("O'qituvchi"), sort: (x) => x.u.name, cell: ({ u, r }) => (
                <span className="flex items-center gap-2.5"><Avatar name={u.name} size={32} />
                  <span className="min-w-0"><span className="block truncate font-medium">{u.name}</span>
                    <span className="block text-xs text-muted">{modeLabel(r) ?? <span className="text-warn">{t("ish haqi ko'rsatilmagan")}</span>}</span></span>
                </span>
              ) },
              { key: "groups", header: t("Guruhlar"), cell: ({ r }) => (
                <span className="flex flex-col gap-0.5 text-sm">
                  {r.groups.length === 0 && <span className="text-muted">—</span>}
                  {r.groups.map((g) => (
                    <span key={g.classId}>{className(g.classId)}{g.share < 1 && <span className="text-muted"> · {Math.round(g.share * 100)}%</span>}
                      {r.mode === "percent" && <span className="tabular text-muted"> · {fmt.moneyShort(g.collected)}</span>}</span>
                  ))}
                </span>
              ) },
              { key: "lessons", header: t("Darslar"), align: "right", sort: (x) => x.r.conducted, cell: ({ r }) => (
                <span className="tabular">{r.conducted}<span className="text-muted"> / {r.scheduled}</span>
                  {r.scheduled > r.conducted && <span className="block text-xs text-warn">{t("{n} tasida davomat yo'q", { n: r.scheduled - r.conducted })}</span>}</span>
              ) },
              { key: "base", header: t("Tushum (ulush)"), align: "right", sort: (x) => x.r.base, cell: ({ r }) => <span className="tabular">{r.base ? fmt.money(r.base) : "—"}</span> },
              { key: "pay", header: t("Hisoblandi"), align: "right", sort: (x) => x.r.payout, cell: ({ r }) => r.mode ? <b className="tabular">{fmt.money(r.payout)}</b> : <Pill tone="slate">—</Pill> },
              ...(!app.canManage ? [] : [{ key: "act", header: "", align: "right" as const, cell: (x: { u: AppUser }) => (
                <button type="button" className={btn.icon} aria-label={t("Tahrirlash")} onClick={() => setEdit(x.u)}><Pencil size={17} /></button>
              ) }]),
            ]} />
        </div>
      </PageBody>
      {edit && <TeacherForm teacher={edit} onClose={() => setEdit(null)} />}
    </>
  );
}
