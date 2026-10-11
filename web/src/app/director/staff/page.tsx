"use client";

import { useState } from "react";
import { Pencil, Plus, ShieldCheck, UserCheck, UserX } from "lucide-react";
import type { AppUser } from "@edunazorat/shared";

import { IssuePasswordButton, useCredentialStatus } from "@/components/credentials";
import { PhoneInput } from "@/components/director/forms";
import { useRun } from "@/components/providers";
import { PageBody, PageHeader } from "@/components/shell";
import { Avatar, btn, Card, Chip, EmptyState, Field, inputCls, ListCard, ListRow, Modal, Pill } from "@/components/ui";
import { useApp } from "@/lib/data/store";
import { fmt } from "@/lib/format";
import { useT } from "@/lib/i18n/react";

/**
 * Direktor: administratorlarni qo'shadi, tahrirlaydi, parol beradi va o'chiradi.
 * Administrator muassasani boshqaradi (o'quvchi, o'qituvchi, ota-ona, jadval, to'lov).
 */
export default function StaffPage() {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const inst = app.myInstitution!;
  const [form, setForm] = useState<AppUser | "new" | null>(null);
  const admins = app.db.users.filter((u) => u.role === "admin" && u.institutionId === inst.id)
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  const isDirector = app.currentUser?.role === "director";
  const creds = useCredentialStatus(isDirector ? admins.map((u) => u.id) : []);
  const branchNames = (u: AppUser) => {
    const names = (inst.settings.branches ?? []).filter((b) => u.branchIds?.includes(b.id)).map((b) => b.name);
    return names.length ? names.join(", ") : t("butun markaz");
  };

  return (
    <>
      <PageHeader title={t("Administratorlar")} subtitle={t("Muassasani boshqaradiganlar")}
        actions={isDirector && <button type="button" className={btn.smPrimary} onClick={() => setForm("new")}><Plus size={16} aria-hidden /> {t("Administrator qo'shish")}</button>} />
      <PageBody className="max-w-3xl">
        <p className="mb-4 text-sm text-muted">
          {t("Administrator o'qituvchi, o'quvchi va ota-onalarni qo'shadi, ularga login va parol beradi, dars jadvali, to'lovlar va sozlamalarni boshqaradi. Siz hamma narsani ko'rasiz.")}
        </p>
        {admins.length === 0 ? (
          <Card><EmptyState icon={ShieldCheck} title={t("Hali administrator yo'q")} text={t("Administrator qo'shing va unga parol bering: u tizimni to'ldirishni boshlaydi.")}
            action={isDirector && <button type="button" className={btn.smPrimary} onClick={() => setForm("new")}><Plus size={16} aria-hidden /> {t("Administrator qo'shish")}</button>} /></Card>
        ) : (
          <ListCard>
            {admins.map((u) => (
              <ListRow key={u.id} leading={<Avatar name={u.name} size={38} />}
                title={<span className="flex items-center gap-2">{u.name}{!u.active && <Pill tone="slate">{t("faol emas")}</Pill>}</span>}
                subtitle={<span className="tabular">{fmt.phone(u.phone)} · {branchNames(u)}{isDirector && <> · {creds.status[u.id]?.hasPassword ? t("parol bor") : t("parol berilmagan")}</>}</span>}
                trailing={isDirector && (
                  <span className="flex items-center gap-0.5">
                    {u.active && <IssuePasswordButton user={u} hasPassword={creds.status[u.id]?.hasPassword} onIssued={creds.refresh} />}
                    <button type="button" className={btn.icon} aria-label={t("Tahrirlash")} onClick={() => setForm(u)}><Pencil size={17} /></button>
                    <button type="button" className={btn.icon} aria-label={u.active ? t("Faolsizlantirish") : t("Faollashtirish")}
                      onClick={() => run(() => app.run("admin.setActive", { id: u.id, active: !u.active }), u.active ? t("Administrator faolsizlantirildi") : t("Administrator faollashtirildi"))}>
                      {u.active ? <UserX size={17} className="text-bad" /> : <UserCheck size={17} className="text-ok" />}
                    </button>
                  </span>
                )} />
            ))}
          </ListCard>
        )}
      </PageBody>
      {form && <AdminForm admin={form === "new" ? undefined : form} onClose={() => setForm(null)} />}
    </>
  );
}

function AdminForm({ admin, onClose }: { admin?: AppUser; onClose: () => void }) {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const [name, setName] = useState(admin?.name ?? "");
  const [phone, setPhone] = useState(admin?.phone.slice(3) ?? "");
  const branches = app.myInstitution?.settings.branches ?? [];
  const [branchIds, setBranchIds] = useState<string[]>(admin?.branchIds ?? []);
  const toggle = (id: string) => setBranchIds(branchIds.includes(id) ? branchIds.filter((x) => x !== id) : [...branchIds, id]);
  const save = async () => {
    if (await run(() => app.run("admin.save", { id: admin?.id, name, phone: `998${phone}`, branchIds }), t("Saqlandi"))) onClose();
  };
  return (
    <Modal open onClose={onClose} title={admin ? t("Administratorni tahrirlash") : t("Yangi administrator")}
      footer={<>
        <button type="button" className={btn.outline} onClick={onClose}>{t("Bekor qilish")}</button>
        <button type="button" className={btn.primary} disabled={!name.trim() || phone.length !== 9} onClick={save}>{t("Saqlash")}</button>
      </>}>
      <div className="flex flex-col gap-3">
        <Field label={t("Familiya va ism")}><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label={t("Telefon (login)")}><PhoneInput value={phone} onChange={setPhone} /></Field>
        {branches.length > 0 && (
          <Field label={t("Qaysi filial")} hint={t("Hech biri belgilanmasa: butun markaz. Filial administratori faqat o'z filiali guruhlari, o'quvchilari va to'lovlarini ko'radi.")} group>
            <div className="flex flex-wrap gap-1.5">
              {branches.map((b) => <Chip key={b.id} selected={branchIds.includes(b.id)} onClick={() => toggle(b.id)}>{b.name}</Chip>)}
            </div>
          </Field>
        )}
        {!admin && <p className="text-xs text-muted">{t("Saqlagach ro'yxatdagi kalit belgisini bosib parol bering: kirish kartasi chiqadi.")}</p>}
      </div>
    </Modal>
  );
}
