"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, GraduationCap, Pencil, Phone, ScanFace, ShieldCheck, ShieldOff } from "lucide-react";
import { invoicePaid, invoiceRemaining, isOverdue, type Invoice, type Student } from "@edunazorat/shared";

import { AdjustForm, PaymentForm, StudentForm } from "@/components/director/forms";
import { LearnerAttendance, LearnerGrades } from "@/components/learner";
import { useRun } from "@/components/providers";
import { useRouteParam } from "@/components/route-param";
import { PageBody, PageHeader } from "@/components/shell";
import {
  Avatar, btn, Card, DataTable, EmptyState, ListCard, ListRow, Pill, Section, Segmented, useConfirm,
} from "@/components/ui";
import { useApp } from "@/lib/data/store";
import { fmt } from "@/lib/format";
import { needsReenroll, usableTemplates } from "@/lib/face/matcher";
import { useT } from "@/lib/i18n/react";

export function StudentClient() {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const { ask, dialog } = useConfirm();
  const id = useRouteParam("id");
  const s = app.student(id);
  const [tab, setTab] = useState<"info" | "grades" | "attendance" | "payments">("info");
  const [edit, setEdit] = useState(false);

  if (!s) return (<><PageHeader back="/director/students" title={t("O'quvchi")} /><PageBody><Card><EmptyState icon={GraduationCap} title={t("O'quvchi topilmadi")} /></Card></PageBody></>);

  const archive = async () => {
    if (!s.archived && !(await ask(t("O'quvchi arxivga o'tkaziladi: ro'yxatlar va yangi hisob-varaqlarda chiqmaydi. Ma'lumotlari saqlanadi."), { ok: t("Arxivlash") }))) return;
    await run(() => app.run("student.archive", { id: s.id, archived: !s.archived }), s.archived ? t("Faol o'quvchilarga qaytarildi") : t("Arxivlandi"));
  };

  return (
    <>
      <PageHeader back="/director/students" title={s.name}
        subtitle={<span>{app.schoolClass(s.classId)?.name}{s.archived && <> · <span className="text-warn">{t("Arxiv")}</span></>}</span>}
        actions={<>
          <button type="button" className={btn.sm} onClick={() => setEdit(true)}><Pencil size={15} aria-hidden /> {t("Tahrirlash")}</button>
          <button type="button" className={btn.sm} onClick={archive}>{s.archived ? <ArchiveRestore size={15} aria-hidden /> : <Archive size={15} aria-hidden />} {s.archived ? t("Qaytarish") : t("Arxivlash")}</button>
        </>}
        below={<div className="scroll-x"><Segmented value={tab} onChange={setTab} options={[
          { value: "info", label: t("Ma'lumot") }, { value: "grades", label: t("Baholar") },
          { value: "attendance", label: t("Davomat") }, { value: "payments", label: t("To'lovlar") },
        ]} /></div>} />
      <PageBody>
        {tab === "info" && <Info student={s} />}
        {tab === "grades" && <LearnerGrades student={s} />}
        {tab === "attendance" && <LearnerAttendance student={s} />}
        {tab === "payments" && <StudentPayments student={s} />}
      </PageBody>
      {edit && <StudentForm student={s} onClose={() => setEdit(false)} />}
      {dialog}
    </>
  );
}

function Info({ student: s }: { student: Student }) {
  const app = useApp();
  const t = useT();
  const parents = app.parentsOfStudent(s.id);
  const account = s.userId ? app.userById(s.userId) : undefined;
  return (
    <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <Card className="flex items-center gap-4 p-5">
          <Avatar name={s.name} image={s.facePhoto} size={72} />
          <div>
            <div className="text-xl font-bold">{s.name}</div>
            <div className="text-sm text-muted">{app.schoolClass(s.classId)?.name}</div>
            {s.birthDay && <div className="text-sm text-muted">{t("Tug'ilgan sana")}: {fmt.dateFull(s.birthDay)}</div>}
          </div>
        </Card>
        <Section title={t("Yuz orqali davomat")}>
          <Card className="flex items-center gap-3 p-4">
            {s.parentConsent ? <ShieldCheck className="text-ok" size={22} /> : <ShieldOff className="text-muted" size={22} />}
            <div className="flex-1 text-sm">
              <div className="font-semibold">{s.parentConsent ? t("Ota-ona roziligi bor") : t("Ota-ona roziligi yo'q")}</div>
              <div className="text-muted">{t("Rozilikni ota-ona o'z ilovasida beradi yoki bekor qiladi")}</div>
            </div>
            {s.parentConsent && <Pill tone={usableTemplates(s).length ? "ok" : "warn"} icon={ScanFace}>{usableTemplates(s).length ? t("Namuna bor") : needsReenroll(s) ? t("Qayta olish kerak") : t("Namuna yo'q")}</Pill>}
          </Card>
        </Section>
      </div>
      <div>
        <Section title={t("Ota-onalar")}>
          {parents.length === 0 ? <Card><EmptyState compact icon={Phone} title={t("Ota-ona biriktirilmagan")} text={t("Tahrirlash orqali telefon raqam qo'shing")} /></Card> : (
            <ListCard>
              {parents.map((p) => (
                <ListRow key={p.id} leading={<Avatar name={p.name} size={38} />} title={p.name}
                  subtitle={<span className="tabular">{fmt.phone(p.phone)}{p.childIds.length > 1 ? ` · ${t("{n} farzand", { n: p.childIds.length })}` : ""}</span>} />
              ))}
            </ListCard>
          )}
        </Section>
        <Section title={t("O'quvchi kabineti")}>
          <Card className="p-4 text-sm">
            {account?.active ? <span>{t("Kirish raqami")}: <b className="tabular">{fmt.phone(account.phone)}</b></span> : <span className="text-muted">{t("O'quvchiga alohida kirish berilmagan")}</span>}
          </Card>
        </Section>
      </div>
    </div>
  );
}

function StudentPayments({ student: s }: { student: Student }) {
  const app = useApp();
  const t = useT();
  const [pay, setPay] = useState<Invoice | null>(null);
  const [adjust, setAdjust] = useState<Invoice | null>(null);
  const invoices = app.invoicesOfStudent(s.id);
  return (
    <>
      <DataTable rows={invoices} rowKey={(i) => i.id}
        empty={<Card><EmptyState icon={GraduationCap} title={t("Hisob-varaq yo'q")} /></Card>}
        columns={[
          { key: "m", header: t("Oy"), cell: (i) => <span className="font-medium">{fmt.month(i.month)}</span> },
          { key: "a", header: t("Summa"), align: "right", cell: (i) => <span>{fmt.money(i.amount)}{i.note && <span className="block text-xs text-muted">{i.note}</span>}</span> },
          { key: "p", header: t("To'langan"), align: "right", cell: (i) => fmt.money(invoicePaid(i)) },
          { key: "r", header: t("Holat"), cell: (i) => invoiceRemaining(i) === 0 ? <Pill tone="ok">{t("To'langan")}</Pill> : isOverdue(i, app.today) ? <Pill tone="bad">{t("Qarz: {v}", { v: fmt.moneyShort(invoiceRemaining(i)) })}</Pill> : <Pill tone="warn">{t("Qoldiq: {v}", { v: fmt.moneyShort(invoiceRemaining(i)) })}</Pill> },
          { key: "x", header: "", align: "right", cell: (i) => (
            <span className="flex justify-end gap-1.5">
              <button type="button" className={btn.sm} onClick={() => setAdjust(i)}>{t("Chegirma")}</button>
              {invoiceRemaining(i) > 0 && <button type="button" className={btn.smPrimary} onClick={() => setPay(i)}>{t("To'lov")}</button>}
            </span>
          ) },
        ]} />
      {pay && <PaymentForm invoice={pay} onClose={() => setPay(null)} />}
      {adjust && <AdjustForm invoice={adjust} onClose={() => setAdjust(null)} />}
    </>
  );
}
