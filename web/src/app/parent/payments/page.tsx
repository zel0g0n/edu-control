"use client";

import { useState } from "react";
import { CreditCard, ExternalLink, FlaskConical, Receipt, ShieldCheck, Wallet } from "lucide-react";
import {
  clickPaymentUrl, invoicePaid, invoiceRemaining, isOverdue, paymePaymentUrl, type Invoice, type Student,
} from "@edunazorat/shared";

import { ParentFrame } from "@/components/parent-frame";
import { useRun } from "@/components/providers";
import { btn, Card, cx, EmptyState, Modal, Pill, ProgressBar, StatCard } from "@/components/ui";
import { useApp } from "@/lib/data/store";
import { fmt } from "@/lib/format";
import { useT } from "@/lib/i18n/react";

export default function Page() {
  return <ParentFrame title="To'lovlar">{(s) => <Payments student={s} />}</ParentFrame>;
}

function Payments({ student: s }: { student: Student }) {
  const app = useApp();
  const t = useT();
  const [paying, setPaying] = useState<Invoice | null>(null);
  const invoices = app.invoicesOfStudent(s.id);
  const debt = invoices.reduce((sum, i) => sum + invoiceRemaining(i), 0);
  const paidYear = invoices.reduce((sum, i) => sum + invoicePaid(i), 0);
  const cls = app.schoolClass(s.classId);
  const history = invoices.flatMap((i) => i.payments.map((p) => ({ ...p, month: i.month }))).sort((a, b) => b.date - a.date);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label={t("Qarzdorlik")} value={debt ? fmt.money(debt) : t("Yo'q")} icon={Wallet} tone={debt ? (invoices.some((i) => isOverdue(i, app.today)) ? "bad" : "warn") : "ok"} />
        <StatCard label={t("Oylik to'lov")} value={cls ? fmt.money(cls.monthlyFee) : "—"} icon={Receipt} caption={cls?.name} />
        <div className="col-span-2 md:col-span-1">
          <StatCard label={t("Jami to'langan")} value={fmt.money(paidYear)} icon={ShieldCheck} tone="ok" caption={t("Ko'rsatilgan oylar bo'yicha")} />
        </div>
      </div>

      <h2 className="mt-7 mb-2.5 px-1 text-[15px] font-bold">{t("Hisob-varaqlar")}</h2>
      {invoices.length === 0 ? (
        <Card><EmptyState icon={Receipt} title={t("Hisob-varaq yo'q")} /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {invoices.map((inv) => {
            const rem = invoiceRemaining(inv);
            const paid = invoicePaid(inv);
            const overdue = isOverdue(inv, app.today);
            return (
              <Card key={inv.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{fmt.month(inv.month)}</div>
                    <div className="text-sm text-muted">{t("Muddat")}: {fmt.date(inv.dueDay)}</div>
                  </div>
                  {rem === 0 ? <Pill tone="ok">{t("To'langan")}</Pill> : overdue ? <Pill tone="bad">{t("Muddati o'tgan")}</Pill> : paid > 0 ? <Pill tone="warn">{t("Qisman")}</Pill> : <Pill tone="slate">{t("Kutilmoqda")}</Pill>}
                </div>
                <div className="tabular mt-3 flex items-baseline justify-between text-sm">
                  <span className="text-muted">{fmt.money(paid)} / {fmt.money(inv.amount)}</span>
                  {rem > 0 && <span className="font-semibold">{t("Qoldiq")}: {fmt.money(rem)}</span>}
                </div>
                <ProgressBar className="mt-1.5" value={inv.amount ? paid / inv.amount : 1} tone={rem === 0 ? "ok" : overdue ? "bad" : "warn"} />
                {inv.note && <p className="mt-2 text-xs text-muted">{inv.note}</p>}
                {rem > 0 && (
                  <button type="button" className={cx(btn.primary, "mt-3 w-full")} onClick={() => setPaying(inv)}>
                    <CreditCard size={17} aria-hidden /> {t("Onlayn to'lash")}
                  </button>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {history.length > 0 && (
        <>
          <h2 className="mt-7 mb-2.5 px-1 text-[15px] font-bold">{t("To'lovlar tarixi")}</h2>
          <Card className="divide-y divide-line">
            {history.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-ok/12 text-ok"><Wallet size={17} aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{fmt.month(p.month)} · {t(`pay.${p.method}`)}</div>
                  <div className="tabular text-xs text-muted">{fmt.dateFull(p.date)}, {fmt.time(p.date)}</div>
                </div>
                <span className="tabular font-semibold">{fmt.money(p.amount)}</span>
              </div>
            ))}
          </Card>
        </>
      )}

      <PayModal invoice={paying} student={s} onClose={() => setPaying(null)} />
    </>
  );
}

function PayModal({ invoice: inv, student: s, onClose }: { invoice: Invoice | null; student: Student; onClose: () => void }) {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const [busy, setBusy] = useState(false);
  if (!inv) return <Modal open={false} onClose={onClose}>{null}</Modal>;
  const amount = invoiceRemaining(inv);
  const cfg = app.institution(s.institutionId)?.settings.payments ?? {};
  const back = typeof window !== "undefined" ? `${window.location.origin}/parent/payments` : undefined;
  const links = [
    { id: "click" as const, name: "Click", url: clickPaymentUrl(cfg, inv.id, amount, back), color: "!bg-[#00a3ff]" },
    { id: "payme" as const, name: "Payme", url: paymePaymentUrl(cfg, inv.id, amount, back), color: "!bg-[#00b8b3]" },
  ];
  const demo = app.mode === "local";

  const demoPay = async (provider: "click" | "payme") => {
    setBusy(true);
    const ok = await run(() => app.run("payment.demoOnline", { invoiceId: inv.id, provider }), t("To'lov qabul qilindi"));
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal open onClose={onClose} title={t("Onlayn to'lov")}>
      <div className="rounded-2xl bg-surface-2 p-4 text-center">
        <div className="text-sm text-muted">{s.name} · {fmt.month(inv.month)}</div>
        <div className="tabular mt-1 text-[26px] font-bold tracking-tight">{fmt.money(amount)}</div>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {links.map((l) => l.url ? (
          <a key={l.id} href={l.url} target="_blank" rel="noreferrer" className={cx(btn.primary, l.color, "h-12 text-white")}>
            {t("{name} orqali to'lash", { name: l.name })} <ExternalLink size={16} aria-hidden />
          </a>
        ) : demo ? (
          <button key={l.id} type="button" disabled={busy} className={cx(btn.primary, l.color, "h-12 text-white")} onClick={() => demoPay(l.id)}>
            {t("{name} orqali to'lash", { name: l.name })}
          </button>
        ) : null)}
      </div>
      {links.some((l) => l.url) ? (
        <p className="mt-3 text-xs text-muted">{t("To'lov tizimi sahifasi ochiladi. To'lov tasdiqlangach holat avtomatik yangilanadi.")}</p>
      ) : demo ? (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-warn"><FlaskConical size={14} className="mt-px shrink-0" aria-hidden />{t("Demo rejim: muassasa Click/Payme merchant ma'lumotlarini kiritmaguncha to'lov taqlid qilinadi, pul yechilmaydi.")}</p>
      ) : (
        <p className="mt-3 text-sm text-muted">{t("Muassasa onlayn to'lovni hali ulamagan. Kassada yoki o'tkazma orqali to'lang.")}</p>
      )}
    </Modal>
  );
}
