"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Download, FilePlus2, Receipt, Wallet } from "lucide-react";
import { addMonths, billingTotals, invoicePaid, invoiceRemaining, isOverdue, type Invoice } from "@edunazorat/shared";

import { AdjustForm, PaymentForm } from "@/components/director/forms";
import { useRun } from "@/components/providers";
import { PageBody, PageHeader } from "@/components/shell";
import { btn, Card, cx, DataTable, EmptyState, Pill, ProgressBar, SearchInput, Segmented, Select, StatCard, useConfirm } from "@/components/ui";
import { useApp } from "@/lib/data/store";
import { exportXlsx } from "@/lib/export";
import { fmt } from "@/lib/format";
import { useT } from "@/lib/i18n/react";

export default function DirectorPayments() {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const { ask, dialog } = useConfirm();
  const inst = app.myInstitution!;
  const [month, setMonth] = useState(app.currentMonth());
  const [filter, setFilter] = useState<"all" | "debt" | "paid">("all");
  const [classId, setClassId] = useState("");
  const [q, setQ] = useState("");
  const [pay, setPay] = useState<Invoice | null>(null);
  const [adjust, setAdjust] = useState<Invoice | null>(null);
  const classes = app.classesOfInstitution(inst.id);
  const monthInv = app.invoicesOfInstitution(inst.id).filter((i) => i.month === month);
  const totals = billingTotals(monthInv);
  const activeStudents = app.studentsOfInstitution(inst.id).filter((s) => (app.schoolClass(s.classId)?.monthlyFee ?? 0) > 0);
  const missing = activeStudents.filter((s) => !monthInv.some((i) => i.studentId === s.id)).length;
  const rows = monthInv
    .filter((i) => filter === "all" || (filter === "debt" ? invoiceRemaining(i) > 0 : invoiceRemaining(i) === 0))
    .filter((i) => !classId || app.student(i.studentId)?.classId === classId)
    .filter((i) => !q || app.student(i.studentId)?.name.toLowerCase().includes(q.toLowerCase()));
  const methods = new Map<string, number>();
  for (const i of monthInv) for (const p of i.payments) methods.set(p.method, (methods.get(p.method) ?? 0) + p.amount);

  const generate = async () => {
    if (!(await ask(t("{m} uchun {n} ta o'quvchiga hisob-varaq yaratiladi (sinf oylik to'lovi bo'yicha).", { m: fmt.month(month), n: missing }), { ok: t("Yaratish") }))) return;
    await run(() => app.run("invoice.generate", { month }), t("Hisob-varaqlar yaratildi"));
  };

  const download = () => {
    const header = [t("O'quvchi"), t("Sinf"), t("Oy"), t("Summa"), t("To'langan"), t("Qoldiq"), t("Muddat"), t("Holat"), t("Izoh")];
    const pays = [t("Sana"), t("O'quvchi"), t("Oy"), t("Summa"), t("Usul")];
    void exportXlsx(`${t("To'lovlar")}_${month}.xlsx`, [
      { name: t("Hisob-varaqlar"), rows: [header, ...rows.map((i) => {
        const s = app.student(i.studentId);
        return [s?.name, app.schoolClass(s?.classId ?? "")?.name, month, i.amount, invoicePaid(i), invoiceRemaining(i), i.dueDay,
          invoiceRemaining(i) === 0 ? t("To'langan") : isOverdue(i, app.today) ? t("Muddati o'tgan") : t("Kutilmoqda"), i.note ?? ""];
      })] },
      { name: t("To'lovlar"), rows: [pays, ...monthInv.flatMap((i) => i.payments.map((p) => [fmt.dateFull(p.date), app.student(i.studentId)?.name, month, p.amount, t(`pay.${p.method}`)]))] },
    ]);
  };

  return (
    <>
      <PageHeader title={t("To'lovlar")}
        actions={<>
          <button type="button" className={btn.sm} onClick={download}><Download size={15} aria-hidden /> Excel</button>
          {missing > 0 && <button type="button" className={btn.smPrimary} onClick={generate}><FilePlus2 size={16} aria-hidden /> {t("Hisob-varaq yaratish ({n})", { n: missing })}</button>}
        </>}
        below={
          <div className="flex items-center gap-1">
            <button type="button" className={btn.icon} onClick={() => setMonth(addMonths(month, -1))} aria-label={t("Oldingi oy")}><ChevronLeft size={20} /></button>
            <span className="min-w-36 text-center font-semibold">{fmt.month(month)}</span>
            <button type="button" className={btn.icon} onClick={() => setMonth(addMonths(month, 1))} aria-label={t("Keyingi oy")}><ChevronRight size={20} /></button>
          </div>
        } />
      <PageBody>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label={t("Reja")} value={fmt.moneyShort(totals.total)} icon={Receipt} caption={t("{n} ta hisob-varaq", { n: monthInv.length })} />
          <StatCard label={t("Yig'ildi")} value={fmt.moneyShort(totals.paid)} icon={Wallet} tone="ok" caption={totals.total ? fmt.percent(totals.paid / totals.total) : undefined} />
          <StatCard label={t("Qoldiq")} value={fmt.moneyShort(totals.remaining)} icon={Wallet} tone={totals.remaining ? "warn" : "ok"} caption={t("{n} qarzdor", { n: totals.debtors })} />
          <Card className="p-4">
            <div className="text-[13px] font-medium text-muted">{t("Usullar bo'yicha")}</div>
            <div className="mt-2 flex flex-col gap-1 text-sm">
              {[...methods.entries()].sort((a, b) => b[1] - a[1]).map(([m, v]) => (
                <div key={m} className="flex justify-between gap-2"><span>{t(`pay.${m}`)}</span><span className="tabular font-semibold">{fmt.moneyShort(v)}</span></div>
              ))}
              {methods.size === 0 && <span className="text-muted">—</span>}
            </div>
          </Card>
        </div>
        {totals.total > 0 && <ProgressBar className="mt-3" value={totals.paid / totals.total} tone="ok" />}
        {missing > 0 && monthInv.length > 0 && (
          <p className="mt-3 rounded-xl bg-warn/12 px-4 py-2.5 text-sm text-warn">{t("{n} ta o'quvchiga bu oy uchun hisob-varaq hali yaratilmagan (yangi qo'shilganlar).", { n: missing })}</p>
        )}

        <div className="mt-5 mb-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <SearchInput value={q} onChange={setQ} placeholder={t("O'quvchi ismi")} />
          <Select value={classId} onChange={setClassId} aria-label={t("Sinf")} className="sm:w-44">
            <option value="">{t("Barcha sinflar")}</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Segmented value={filter} onChange={setFilter} options={[{ value: "all", label: t("Barchasi") }, { value: "debt", label: t("Qarzdorlar") }, { value: "paid", label: t("To'langan") }]} />
        </div>
        <DataTable rows={rows} rowKey={(i) => i.id} initialSort={{ key: "rem", dir: -1 }}
          empty={<Card><EmptyState icon={Receipt} title={monthInv.length ? t("Hech narsa topilmadi") : t("Bu oy uchun hisob-varaq yo'q")}
            action={!monthInv.length && missing > 0 && <button type="button" className={btn.smPrimary} onClick={generate}><FilePlus2 size={16} aria-hidden /> {t("Hisob-varaq yaratish ({n})", { n: missing })}</button>} /></Card>}
          columns={[
            { key: "name", header: t("O'quvchi"), sort: (i) => app.student(i.studentId)?.name ?? "", cell: (i) => (
              <span className="min-w-0"><span className="block truncate font-medium">{app.student(i.studentId)?.name}</span><span className="block text-xs text-muted">{app.schoolClass(app.student(i.studentId)?.classId ?? "")?.name}{i.note ? ` · ${i.note}` : ""}</span></span>
            ) },
            { key: "amount", header: t("Summa"), align: "right", sort: (i) => i.amount, cell: (i) => fmt.money(i.amount) },
            { key: "paid", header: t("To'langan"), align: "right", sort: (i) => invoicePaid(i), cell: (i) => fmt.money(invoicePaid(i)) },
            { key: "rem", header: t("Qoldiq"), align: "right", sort: (i) => invoiceRemaining(i), cell: (i) => {
              const r = invoiceRemaining(i);
              return r === 0 ? <Pill tone="ok">{t("To'langan")}</Pill> : <span className={cx("font-semibold", isOverdue(i, app.today) ? "text-bad" : "text-warn")}>{fmt.money(r)}</span>;
            } },
            { key: "act", header: "", align: "right", cell: (i) => (
              <span className="flex justify-end gap-1.5">
                <button type="button" className={btn.sm} onClick={() => setAdjust(i)}>{t("Chegirma")}</button>
                {invoiceRemaining(i) > 0 && <button type="button" className={btn.smPrimary} onClick={() => setPay(i)}>{t("To'lov")}</button>}
              </span>
            ) },
          ]} />
      </PageBody>
      {pay && <PaymentForm invoice={pay} onClose={() => setPay(null)} />}
      {adjust && <AdjustForm invoice={adjust} onClose={() => setAdjust(null)} />}
      {dialog}
    </>
  );
}
