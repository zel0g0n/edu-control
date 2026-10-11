"use client";

import { useEffect, useState } from "react";
import { History, ShieldAlert } from "lucide-react";
import { dayKey, type AuditEntry } from "@edunazorat/shared";

import { errorText } from "@/components/providers";
import { PageBody, PageHeader } from "@/components/shell";
import { btn, Card, cx, EmptyState, ListCard, SearchInput, Select } from "@/components/ui";
import { useApp } from "@/lib/data/store";
import { fmt } from "@/lib/format";
import { useT } from "@/lib/i18n/react";

const GROUPS: Record<string, (a: string) => boolean> = {
  all: () => true,
  money: (a) => a.startsWith("invoice.") || a.startsWith("payment."),
  people: (a) => /^(student|teacher|admin|lead)\./.test(a),
  security: (a) => a.startsWith("auth.") || a === "settings.save" || a === "nvr.configure",
};

/**
 * Faoliyat jurnali: kim qachon nimani o'zgartirdi (to'lov, chegirma, o'quvchi, parol, kirish).
 * Faqat direktor ko'radi; yozuvlarni hech kim o'chira olmaydi.
 */
export default function AuditPage() {
  const app = useApp();
  const t = useT();
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [more, setMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    app.audit().then((r) => { if (alive) { setRows(r); setMore(r.length >= 50); } }).catch((e) => { if (alive) setError(errorText(e)); });
    return () => { alive = false; };
  }, [app]);

  const loadMore = async () => {
    const last = rows?.at(-1);
    if (!last) return;
    try {
      const r = await app.audit(last.id);
      setRows([...(rows ?? []), ...r]);
      setMore(r.length >= 50);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const who = (e: AuditEntry) => (e.actorId ? app.userById(e.actorId)?.name ?? t(`role.${e.actorRole ?? "admin"}`) : t("Noma'lum"));
  const targetName = (e: AuditEntry) => {
    if (!e.target) return "";
    return app.student(e.target)?.name ?? app.userById(e.target)?.name ?? app.schoolClass(e.target)?.name
      ?? (() => { const inv = app.db.invoices.find((i) => i.id === e.target); return inv ? `${app.student(inv.studentId)?.name ?? ""} · ${fmt.month(inv.month)}` : ""; })()
      ?? "";
  };
  const detail = (e: AuditEntry) => {
    const d = e.details ?? {};
    const parts: string[] = [];
    if (typeof d.name === "string" && !targetName(e)) parts.push(d.name);
    if (typeof d.amount === "number") parts.push(fmt.money(d.amount));
    if (typeof d.method === "string") parts.push(d.method === "sms" ? "SMS" : d.method === "password" ? t("parol") : t(`pay.${d.method}`));
    if (typeof d.login === "string") parts.push(d.login);
    if (typeof d.month === "string") parts.push(fmt.month(d.month));
    if (typeof d.note === "string" && e.action === "invoice.adjust") parts.push(d.note);
    for (const s of ["present", "late", "absent", "excused"]) if (typeof d[s] === "number") parts.push(`${t(`att.${s}`)}: ${d[s]}`);
    return parts.join(" · ");
  };
  const list = (rows ?? []).filter((e) => GROUPS[group](e.action))
    .filter((e) => !q || `${who(e)} ${targetName(e)} ${t(`audit.${e.action}`)} ${detail(e)}`.toLowerCase().includes(q.toLowerCase()));
  const days: { day: string; items: AuditEntry[] }[] = [];
  for (const e of list) {
    const d = dayKey(e.at);
    if (days.at(-1)?.day !== d) days.push({ day: d, items: [] });
    days.at(-1)!.items.push(e);
  }

  return (
    <>
      <PageHeader title={t("Faoliyat jurnali")} subtitle={t("Kim qachon nimani o'zgartirdi")} />
      <PageBody className="max-w-4xl">
        <p className="mb-4 text-sm text-muted">{t("To'lov, chegirma, o'quvchi va xodimlar, parol berish va tizimga kirishlar shu yerda yoziladi. Yozuvlarni hech kim o'zgartira yoki o'chira olmaydi.")}</p>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <SearchInput value={q} onChange={setQ} placeholder={t("Ism yoki amal")} className="min-w-60 flex-1" />
          <Select value={group} onChange={setGroup} aria-label={t("Turi")} className="sm:w-48">
            <option value="all">{t("Barchasi")}</option>
            <option value="money">{t("To'lovlar")}</option>
            <option value="people">{t("O'quvchi va xodimlar")}</option>
            <option value="security">{t("Kirish va xavfsizlik")}</option>
          </Select>
        </div>
        {error && <p role="alert" className="mb-3 text-sm text-bad">{error}</p>}
        {rows && list.length === 0 && <Card><EmptyState icon={History} title={t("Yozuv yo'q")} /></Card>}
        {days.map((g) => (
          <section key={g.day} className="mb-4">
            <h2 className="mb-2 px-1 text-[13px] font-semibold text-muted">{g.day === app.today ? t("Bugun") : fmt.weekday(g.day)}, {fmt.date(g.day)}</h2>
            <ListCard>
              {g.items.map((e) => {
                const alert = e.action === "auth.loginFailed" || e.action === "auth.loginBlocked";
                return (
                  <div key={e.id} className="flex items-start gap-3 px-4 py-2.5">
                    <span className="tabular w-11 shrink-0 pt-0.5 text-xs text-muted">{fmt.time(e.at)}</span>
                    <span className="min-w-0 flex-1 text-sm">
                      <span className={cx("font-medium", alert && "text-bad")}>
                        {alert && <ShieldAlert size={14} className="mr-1 inline align-[-2px]" aria-hidden />}
                        {t(`audit.${e.action}`)}
                      </span>
                      {targetName(e) && <span> · {targetName(e)}</span>}
                      <span className="block text-xs text-muted">{who(e)}{detail(e) && ` · ${detail(e)}`}</span>
                    </span>
                  </div>
                );
              })}
            </ListCard>
          </section>
        ))}
        {rows && more && <button type="button" className={btn.outline} onClick={loadMore}>{t("Yana ko'rsatish")}</button>}
      </PageBody>
    </>
  );
}
