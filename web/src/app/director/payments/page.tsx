"use client";

import { useState } from "react";
import { BellRing, ChevronLeft, ChevronRight, Download, FilePlus2, Link2, Receipt, Wallet } from "lucide-react";
import { addMonths, billingTotals, REMIND_GAP, formatReceiptId, inClass, invoicePaid, invoiceRemaining, isOverdue, type Invoice } from "@edunazorat/shared";

import { useBranchFilter } from "@/components/director/branch";
import { AdjustForm, PaymentForm } from "@/components/director/forms";
import { PayLinkModal } from "@/components/director/pay-link";
import { useRun } from "@/components/providers";
import { PageBody, PageHeader } from "@/components/shell";
import { btn, Card, cx, DataTable, EmptyState, Pill, ProgressBar, SearchInput, Segmented, Select, StatCard, useConfirm } from "@/components/ui";
import { hasFee } from "@/components/invoice-lines";
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
  const [link, setLink] = useState<Invoice | null>(null);
  const branch = useBranchFilter();
  const classes = app.classesOfInstitution(inst.id).filter(branch.matchClass);
  const inBranch = (i: Invoice) => { const s = app.student(i.studentId); return !branch.branchId || (!!s && branch.matchStudent(s)); };
  const allMonthInv = app.invoicesOfInstitution(inst.id).filter((i) => i.month === month);
  const monthInv = allMonthInv.filter(inBranch);
  const totals = billingTotals(monthInv);
  const activeStudents = app.studentsOfInstitution(inst.id).filter((s) => app.classesOfStudent(s).some(hasFee));
  // Hisob-varaq butun muassasa uchun yaratiladi (filial filtridan qat'i nazar)
  const missing = activeStudents.filter((s) => !allMonthInv.some((i) => i.studentId === s.id)).length;
  const rows = monthInv
    .filter((i) => filter === "all" || (filter === "debt" ? invoiceRemaining(i) > 0 : invoiceRemaining(i) === 0))
    .filter((i) => { const s = app.student(i.studentId); return !classId || (!!s && inClass(s, classId)); })
    .filter((i) => {
      if (!q) return true;
      const s = app.student(i.studentId);
      return !!s && (s.name.toLowerCase().includes(q.toLowerCase()) || (!!s.receiptId && s.receiptId === q.replace(/\D/g, "")));
    });
  const methods = new Map<string, number>();
  for (const i of monthInv) for (const p of i.payments) methods.set(p.method, (methods.get(p.method) ?? 0) + p.amount);

  const generate = async () => {
    if (!(await ask(t("{m} uchun {n} ta o'quvchiga hisob-varaq yaratiladi (sinf oylik to'lovi bo'yicha).", { m: fmt.month(month), n: missing }), { ok: t("Yaratish") }))) return;
    await run(() => app.run("invoice.generate", { month }), t("Hisob-varaqlar yaratildi"));
  };

  // Qarz eslatmasi: filtrdagi qarzdorlar (sutkada bir marta)
  const remindable = rows.filter((i) => invoiceRemaining(i) > 0 && !(i.remindedAt && i.remindedAt > app.now - REMIND_GAP));
  const remind = async (list: Invoice[]) => {
    if (list.length > 1 && !(await ask(t("{n} ta qarzdorning ota-onasiga (katta yoshlilarga o'ziga) qarz miqdori va Kvitansiya ID bilan eslatma boradi.", { n: list.length }), { ok: t("Yuborish") }))) return;
    await run(() => app.run("payment.remind", { invoiceIds: list.map((i) => i.id) }), t("Eslatma yuborildi"));
  };

  const download = () => {
    const header = [t("O'quvchi"), t("Kvitansiya ID"), t("Sinf"), t("Oy"), t("Summa"), t("To'langan"), t("Qoldiq"), t("Muddat"), t("Holat"), t("Izoh")];
    const pays = [t("Sana"), t("O'quvchi"), t("Oy"), t("Summa"), t("Usul")];
    void exportXlsx(`${t("To'lovlar")}_${month}.xlsx`, [
      { name: t("Hisob-varaqlar"), rows: [header, ...rows.map((i) => {
        const s = app.student(i.studentId);
        return [s?.name, s?.receiptId ?? "", s ? app.classNamesOf(s) : "", month, i.amount, invoicePaid(i), invoiceRemaining(i), i.dueDay,
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
          {app.canManage && remindable.length > 0 && <button type="button" className={btn.sm} onClick={() => remind(remindable)}><BellRing size={15} aria-hidden /> {t("Eslatma ({n})", { n: remindable.length })}</button>}
          {app.canManage && missing > 0 && <button type="button" className={btn.smPrimary} onClick={generate}><FilePlus2 size={16} aria-hidden /> {t("Hisob-varaq yaratish ({n})", { n: missing })}</button>}
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

        <div className={cx("mt-5 mb-3 grid gap-2", branch.select ? "sm:grid-cols-[1fr_auto_auto_auto]" : "sm:grid-cols-[1fr_auto_auto]")}>
          <SearchInput value={q} onChange={setQ} placeholder={t("O'quvchi ismi yoki Kvitansiya ID")} />
          {branch.select}
          <Select value={classId} onChange={setClassId} aria-label={t("Sinf")} className="sm:w-44">
            <option value="">{t("Barcha sinflar")}</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Segmented value={filter} onChange={setFilter} options={[{ value: "all", label: t("Barchasi") }, { value: "debt", label: t("Qarzdorlar") }, { value: "paid", label: t("To'langan") }]} />
        </div>
        <DataTable rows={rows} rowKey={(i) => i.id} initialSort={{ key: "rem", dir: -1 }}
          empty={<Card><EmptyState icon={Receipt} title={monthInv.length ? t("Hech narsa topilmadi") : t("Bu oy uchun hisob-varaq yo'q")}
            action={app.canManage && !monthInv.length && missing > 0 && <button type="button" className={btn.smPrimary} onClick={generate}><FilePlus2 size={16} aria-hidden /> {t("Hisob-varaq yaratish ({n})", { n: missing })}</button>} /></Card>}
          columns={[
            { key: "name", header: t("O'quvchi"), sort: (i) => app.student(i.studentId)?.name ?? "", cell: (i) => (
              <span className="min-w-0"><span className="block truncate font-medium">{app.student(i.studentId)?.name}</span><span className="block text-xs text-muted">{app.student(i.studentId) ? app.classNamesOf(app.student(i.studentId)!) : ""}{app.student(i.studentId)?.receiptId ? ` · № ${formatReceiptId(app.student(i.studentId)?.receiptId)}` : ""}{i.note ? ` · ${i.note}` : ""}</span></span>
            ) },
            { key: "amount", header: t("Summa"), align: "right", sort: (i) => i.amount, cell: (i) => {
              // Qoldirilgan darslar chegirmasi bo'lsa ko'rsatiladi
              const refund = (i.lines ?? []).filter((l) => l.kind === "absenceRefund").reduce((s, l) => s + l.amount, 0);
              return <span>{fmt.money(i.amount)}{refund < 0 && <span className="block text-xs text-ok">{t("chegirma {v}", { v: fmt.money(-refund) })}</span>}</span>;
            } },
            { key: "paid", header: t("To'langan"), align: "right", sort: (i) => invoicePaid(i), cell: (i) => fmt.money(invoicePaid(i)) },
            { key: "rem", header: t("Qoldiq"), align: "right", sort: (i) => invoiceRemaining(i), cell: (i) => {
              const r = invoiceRemaining(i);
              return r === 0 ? <Pill tone="ok">{t("To'langan")}</Pill> : (
                <span><span className={cx("font-semibold", isOverdue(i, app.today) ? "text-bad" : "text-warn")}>{fmt.money(r)}</span>
                  {i.remindedAt && <span className="block text-xs text-muted">{t("eslatildi {d}", { d: fmt.date(i.remindedAt) })}</span>}</span>
              );
            } },
            ...(!app.canManage ? [] : [{ key: "act", header: "", align: "right" as const, cell: (i: Invoice) => (
              <span className="flex justify-end gap-1.5">
                {invoiceRemaining(i) > 0 && <button type="button" className={btn.sm} disabled={!!i.remindedAt && i.remindedAt > app.now - REMIND_GAP} onClick={() => remind([i])} aria-label={t("Eslatma yuborish")} title={t("Eslatma yuborish")}><BellRing size={15} aria-hidden /></button>}
                {invoiceRemaining(i) > 0 && <button type="button" className={btn.sm} onClick={() => setLink(i)} aria-label={t("To'lov havolasi")} title={t("To'lov havolasi")}><Link2 size={15} aria-hidden /></button>}
                <button type="button" className={btn.sm} onClick={() => setAdjust(i)}>{t("Chegirma")}</button>
                {invoiceRemaining(i) > 0 && <button type="button" className={btn.smPrimary} onClick={() => setPay(i)}>{t("To'lov")}</button>}
              </span>
            ) }]),
          ]} />
      </PageBody>
      {pay && <PaymentForm invoice={pay} onClose={() => setPay(null)} />}
      {adjust && <AdjustForm invoice={adjust} onClose={() => setAdjust(null)} />}
      {link && <PayLinkModal invoice={link} onClose={() => setLink(null)} />}
      {dialog}
    </>
  );
}
