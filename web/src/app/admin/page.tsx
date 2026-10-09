"use client";

import { useState } from "react";
import { Building2, Lock, LockOpen, Pencil, Plus } from "lucide-react";
import type { Institution, InstitutionType } from "@edunazorat/shared";

import { PhoneInput } from "@/components/director/forms";
import { useRun } from "@/components/providers";
import { PageBody, PageHeader } from "@/components/shell";
import { btn, Card, DataTable, EmptyState, Field, inputCls, Modal, Pill, Select, StatCard, useConfirm } from "@/components/ui";
import { useApp } from "@/lib/data/store";
import { fmt } from "@/lib/format";
import { useT } from "@/lib/i18n/react";

export default function AdminPage() {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const { ask, dialog } = useConfirm();
  const [form, setForm] = useState<Institution | "new" | null>(null);
  const list = [...app.db.institutions].sort((a, b) => b.createdAt - a.createdAt);
  const studentsOf = (id: string) => app.db.students.filter((s) => s.institutionId === id && !s.archived).length;
  const directorOf = (id: string) => app.db.users.find((u) => u.role === "director" && u.institutionId === id);

  const toggle = async (i: Institution) => {
    if (i.active && !(await ask(t("«{name}» bloklansa, uning barcha foydalanuvchilari tizimga kira olmaydi.", { name: i.name }), { danger: true, ok: t("Bloklash") }))) return;
    await run(() => app.run("institution.setActive", { id: i.id, active: !i.active }), i.active ? t("Bloklandi") : t("Faollashtirildi"));
  };

  return (
    <>
      <PageHeader title={t("Muassasalar")} subtitle={t("Platforma boshqaruvi")}
        actions={<button type="button" className={btn.smPrimary} onClick={() => setForm("new")}><Plus size={16} aria-hidden /> {t("Muassasa qo'shish")}</button>} />
      <PageBody>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <StatCard label={t("Muassasalar")} value={String(list.length)} icon={Building2} caption={t("{n} faol", { n: list.filter((i) => i.active).length })} />
          <StatCard label={t("O'quvchilar")} value={String(app.db.students.filter((s) => !s.archived).length)} icon={Building2} />
          <div className="col-span-2 md:col-span-1"><StatCard label={t("Sinflar / guruhlar")} value={String(app.db.classes.length)} icon={Building2} /></div>
        </div>
        <div className="mt-5">
          <DataTable rows={list} rowKey={(i) => i.id}
            empty={<Card><EmptyState icon={Building2} title={t("Muassasa yo'q")} /></Card>}
            columns={[
              { key: "name", header: t("Nomi"), sort: (i) => i.name, cell: (i) => <span className="min-w-0"><span className="block truncate font-medium">{i.name}</span><span className="block text-xs text-muted">{t(`inst.${i.type}`)} · {i.city}</span></span> },
              { key: "dir", header: t("Direktor"), cell: (i) => { const d = directorOf(i.id); return d ? <span><span className="block">{d.name}</span><span className="tabular block text-xs text-muted">{fmt.phone(d.phone)}</span></span> : <Pill tone="warn">{t("yo'q")}</Pill>; } },
              { key: "students", header: t("O'quvchilar"), align: "right", sort: (i) => studentsOf(i.id), cell: (i) => studentsOf(i.id) },
              { key: "since", header: t("Qo'shilgan"), sort: (i) => i.createdAt, cell: (i) => fmt.dateFull(i.createdAt) },
              { key: "status", header: t("Holat"), cell: (i) => <Pill tone={i.active ? "ok" : "bad"}>{i.active ? t("Faol") : t("Bloklangan")}</Pill> },
              { key: "act", header: "", align: "right", cell: (i) => (
                <span className="flex justify-end gap-1">
                  <button type="button" className={btn.icon} aria-label={t("Tahrirlash")} onClick={() => setForm(i)}><Pencil size={17} /></button>
                  <button type="button" className={btn.icon} aria-label={i.active ? t("Bloklash") : t("Faollashtirish")} onClick={() => toggle(i)}>
                    {i.active ? <Lock size={17} className="text-bad" /> : <LockOpen size={17} className="text-ok" />}
                  </button>
                </span>
              ) },
            ]} />
        </div>
      </PageBody>
      {form && <InstitutionForm inst={form === "new" ? undefined : form} onClose={() => setForm(null)} />}
      {dialog}
    </>
  );
}

function InstitutionForm({ inst, onClose }: { inst?: Institution; onClose: () => void }) {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const director = inst ? app.db.users.find((u) => u.role === "director" && u.institutionId === inst.id) : undefined;
  const [name, setName] = useState(inst?.name ?? "");
  const [type, setType] = useState<InstitutionType>(inst?.type ?? "school");
  const [city, setCity] = useState(inst?.city ?? "");
  const [dName, setDName] = useState(director?.name ?? "");
  const [dPhone, setDPhone] = useState(director?.phone.slice(3) ?? "");
  const save = async () => {
    const ok = await run(() => app.run("institution.save", { id: inst?.id, name, type, city, director: dPhone.length === 9 ? { name: dName || t("Direktor"), phone: `998${dPhone}` } : undefined }), t("Saqlandi"));
    if (ok) onClose();
  };
  return (
    <Modal open onClose={onClose} title={inst ? t("Muassasani tahrirlash") : t("Yangi muassasa")}
      footer={<><button type="button" className={btn.outline} onClick={onClose}>{t("Bekor qilish")}</button><button type="button" className={btn.primary} disabled={!name.trim()} onClick={save}>{t("Saqlash")}</button></>}>
      <div className="flex flex-col gap-3">
        <Field label={t("Nomi")}><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label={t("Turi")}>
          <Select value={type} onChange={(v) => setType(v as InstitutionType)}>
            <option value="school">{t("inst.school")}</option>
            <option value="center">{t("inst.center")}</option>
          </Select>
        </Field>
        <Field label={t("Manzil")}><input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} placeholder={t("Toshkent, Yunusobod")} /></Field>
        <div className="mt-2 text-[13px] font-semibold text-muted">{t("Direktor (shu raqam bilan kiradi)")}</div>
        <Field label={t("Ismi")}><input className={inputCls} value={dName} onChange={(e) => setDName(e.target.value)} /></Field>
        <Field label={t("Telefon")}><PhoneInput value={dPhone} onChange={setDPhone} /></Field>
      </div>
    </Modal>
  );
}
