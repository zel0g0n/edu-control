"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, Download, Phone, Plus, Trash2, UserPlus, UserRoundSearch, X } from "lucide-react";
import { isoWeekday, type CommandMap, type Lead, type LeadSource, type LeadStatus } from "@edunazorat/shared";

import { PhoneInput } from "@/components/director/forms";
import { useRun } from "@/components/providers";
import { PageBody, PageHeader, ReadOnlyNote } from "@/components/shell";
import {
  btn, Card, cx, DataTable, EmptyState, Field, inputCls, Modal, Pill, SearchInput, Segmented, Select, textareaCls, useConfirm, type Tone,
} from "@/components/ui";
import { useApp } from "@/lib/data/store";
import { exportXlsx } from "@/lib/export";
import { fmt } from "@/lib/format";
import { useT } from "@/lib/i18n/react";

const STATUSES: LeadStatus[] = ["new", "contacted", "trial", "enrolled", "lost"];
const SOURCES: LeadSource[] = ["instagram", "telegram", "referral", "outdoor", "walkin", "other"];
const STATUS_TONE: Record<LeadStatus, Tone> = { new: "info", contacted: "primary", trial: "warn", enrolled: "ok", lost: "slate" };
const LOST_REASONS = ["Narx qimmat", "Vaqt to'g'ri kelmadi", "Boshqa markazni tanladi", "Javob bermadi", "Uzoq"];

/**
 * Lidlar: qiziqqanlar ro'yxati. Qo'ng'iroq → sinov darsi → o'quvchiga aylantirish.
 * Administrator boshqaradi, direktor faqat ko'radi.
 */
export default function LeadsPage() {
  const app = useApp();
  const t = useT();
  const router = useRouter();
  const inst = app.myInstitution!;
  const [stage, setStage] = useState<LeadStatus | "open">("open");
  const [q, setQ] = useState("");
  const [form, setForm] = useState<Lead | "new" | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const all = app.db.leads.filter((l) => l.institutionId === inst.id);
  const count = (s: LeadStatus) => all.filter((l) => l.status === s).length;
  const isOpen = (l: Lead) => l.status !== "enrolled" && l.status !== "lost";
  const rows = all
    .filter((l) => (stage === "open" ? isOpen(l) : l.status === stage))
    .filter((l) => {
      if (!q.trim()) return true;
      const digits = q.replace(/\D/g, "");
      return `${l.name} ${l.interest}`.toLowerCase().includes(q.trim().toLowerCase()) || (digits.length >= 3 && l.phone.includes(digits));
    })
    .sort((a, b) => b.createdAt - a.createdAt);
  const current = open ? all.find((l) => l.id === open) : undefined;

  // Konversiya: shu oyda kelgan lidlardan nechtasi o'quvchi bo'ldi
  const month = app.currentMonth();
  const thisMonth = all.filter((l) => new Date(l.createdAt).toISOString().slice(0, 7) === month);
  const conv = all.length ? count("enrolled") / all.length : null;
  const trialsToday = all.filter((l) => l.status === "trial" && l.trialDay === app.today).length;

  const download = () => {
    const header = [t("Ism"), t("Telefon"), t("Qiziqishi"), t("Manba"), t("Holat"), t("Sinov darsi"), t("Izoh"), t("Qo'shilgan")];
    void exportXlsx(`${t("Lidlar")}.xlsx`, [{ name: t("Lidlar"), rows: [header, ...all.map((l) => [
      l.name, fmt.phone(l.phone), l.interest, t(`lead.src.${l.source}`), t(`lead.st.${l.status}`),
      l.trialDay ? `${fmt.dateFull(l.trialDay)} · ${app.schoolClass(l.trialClassId ?? "")?.name ?? ""}` : "",
      [l.note, l.lostReason].filter(Boolean).join(" · "), fmt.dateFull(l.createdAt),
    ])] }]);
  };

  return (
    <>
      <PageHeader title={t("Lidlar")} subtitle={t("Qiziqqanlar va sinov darslari")}
        actions={<>
          <button type="button" className={btn.sm} onClick={download}><Download size={15} aria-hidden /> Excel</button>
          {app.canManage && <button type="button" className={btn.smPrimary} onClick={() => setForm("new")}><Plus size={16} aria-hidden /> {t("Lid qo'shish")}</button>}
        </>} />
      <PageBody>
        {!app.canManage && <ReadOnlyNote />}
        <Card className="mb-4 p-4">
          <div className="grid grid-cols-3 gap-1 sm:grid-cols-5 sm:gap-3">
            {STATUSES.map((s) => (
              <button key={s} type="button" onClick={() => setStage(s)} className={cx("rounded-xl px-3 py-2 text-left transition hover:bg-surface-2", stage === s && "bg-surface-2")}>
                <div className="text-xs font-medium text-muted">{t(`lead.st.${s}`)}</div>
                <div className="tabular text-2xl font-semibold">{count(s)}</div>
              </button>
            ))}
          </div>
          <p className="mt-2 px-3 text-sm text-muted">
            {t("Konversiya: {p} · shu oy {n} ta yangi lid", { p: fmt.percent(conv), n: thisMonth.length })}
            {trialsToday > 0 && <> · <b className="text-warn">{t("bugun {n} ta sinov darsi", { n: trialsToday })}</b></>}
          </p>
        </Card>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <SearchInput value={q} onChange={setQ} placeholder={t("Ism, telefon yoki kurs")} className="min-w-60 flex-1" />
          <Segmented value={stage} onChange={setStage} options={[
            { value: "open", label: t("Ochiq") }, { value: "enrolled", label: t("lead.st.enrolled") }, { value: "lost", label: t("lead.st.lost") },
          ]} />
        </div>
        <DataTable rows={rows} rowKey={(l) => l.id} onRowClick={(l) => setOpen(l.id)}
          empty={<Card><EmptyState icon={UserRoundSearch} title={all.length ? t("Hech narsa topilmadi") : t("Hali lid yo'q")}
            text={all.length ? undefined : t("Qo'ng'iroq qilgan yoki Instagram'da yozgan har bir odamni shu yerga yozing: hech kim unutilmaydi.")}
            action={app.canManage && !all.length && <button type="button" className={btn.smPrimary} onClick={() => setForm("new")}><Plus size={16} aria-hidden /> {t("Lid qo'shish")}</button>} /></Card>}
          columns={[
            { key: "name", header: t("Ism"), sort: (l) => l.name, cell: (l) => (
              <span className="min-w-0"><span className="block truncate font-medium">{l.name}</span>
                <span className="tabular block text-xs text-muted">{fmt.phone(l.phone)}</span></span>
            ) },
            { key: "interest", header: t("Qiziqishi"), cell: (l) => <span>{l.interest || "—"}<span className="block text-xs text-muted">{t(`lead.src.${l.source}`)}</span></span> },
            { key: "status", header: t("Holat"), sort: (l) => STATUSES.indexOf(l.status), cell: (l) => (
              <span className="flex flex-col items-start gap-0.5">
                <Pill tone={STATUS_TONE[l.status]}>{t(`lead.st.${l.status}`)}</Pill>
                {l.status === "trial" && l.trialDay && (
                  <span className={cx("text-xs", l.trialDay < app.today && l.trialCame === undefined ? "text-bad" : "text-muted")}>
                    {fmt.date(l.trialDay)} · {app.schoolClass(l.trialClassId ?? "")?.name}
                    {l.trialCame === true ? ` · ${t("keldi")}` : l.trialCame === false ? ` · ${t("kelmadi")}` : ""}
                  </span>
                )}
                {l.status === "lost" && l.lostReason && <span className="text-xs text-muted">{l.lostReason}</span>}
              </span>
            ) },
            { key: "date", header: t("Qo'shilgan"), hideOnMobile: true, align: "right", sort: (l) => l.createdAt, cell: (l) => <span className="text-sm text-muted">{fmt.date(l.createdAt)}</span> },
          ]} />
      </PageBody>
      {form && <LeadForm lead={form === "new" ? undefined : form} onClose={(id) => { setForm(null); if (id) setOpen(id); }} />}
      {current && !form && <LeadCard lead={current} onClose={() => setOpen(null)} onEdit={() => setForm(current)}
        onConverted={(sid) => { setOpen(null); router.push(`/director/students/${sid}`); }} />}
    </>
  );
}

function LeadForm({ lead, onClose }: { lead?: Lead; onClose: (savedId?: string) => void }) {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const [name, setName] = useState(lead?.name ?? "");
  const [phone, setPhone] = useState(lead?.phone.slice(3) ?? "");
  const [interest, setInterest] = useState(lead?.interest ?? "");
  const [source, setSource] = useState<LeadSource>(lead?.source ?? "instagram");
  const [note, setNote] = useState(lead?.note ?? "");
  const courses = app.classesOfInstitution(app.myInstitution!.id).map((c) => c.name);
  const save = async () => {
    const p = await run(() => app.run("lead.save", { id: lead?.id, name, phone: `998${phone}`, interest, source, note }), t("Saqlandi"));
    if (p) onClose(p.upsert?.leads?.[0]?.id);
  };
  return (
    <Modal open onClose={() => onClose()} title={lead ? t("Lidni tahrirlash") : t("Yangi lid")}
      footer={<>
        <button type="button" className={btn.outline} onClick={() => onClose()}>{t("Bekor qilish")}</button>
        <button type="button" className={btn.primary} disabled={!name.trim() || phone.length !== 9} onClick={save}>{t("Saqlash")}</button>
      </>}>
      <div className="flex flex-col gap-3">
        <Field label={t("Ism")}><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} /></Field>
        <Field label={t("Telefon")}><PhoneInput value={phone} onChange={setPhone} /></Field>
        <Field label={t("Qaysi kursga qiziqadi")}>
          <input className={inputCls} list="lead-courses" value={interest} onChange={(e) => setInterest(e.target.value)} placeholder="IELTS, SAT…" maxLength={80} />
          <datalist id="lead-courses">{courses.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label={t("Qayerdan bildi")}>
          <Select value={source} onChange={(v) => setSource(v as LeadSource)}>
            {SOURCES.map((s) => <option key={s} value={s}>{t(`lead.src.${s}`)}</option>)}
          </Select>
        </Field>
        <Field label={t("Izoh")}><textarea className={textareaCls} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Masalan: kechki guruh kerak, darajasi B1")} /></Field>
      </div>
    </Modal>
  );
}

/** Lid kartasi: holatni o'zgartirish, sinov darsi, o'quvchiga aylantirish. */
function LeadCard({ lead, onClose, onEdit, onConverted }: { lead: Lead; onClose: () => void; onEdit: () => void; onConverted: (studentId: string) => void }) {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const { ask, dialog } = useConfirm();
  const classes = app.classesOfInstitution(app.myInstitution!.id);
  const guess = classes.find((c) => lead.interest && c.name.toLowerCase().includes(lead.interest.toLowerCase()))?.id;
  const [trialClass, setTrialClass] = useState(lead.trialClassId ?? guess ?? classes[0]?.id ?? "");
  const [trialDay, setTrialDay] = useState(lead.trialDay ?? app.today);
  const [mode, setMode] = useState<"view" | "trial" | "convert" | "lost">("view");
  const [lostReason, setLostReason] = useState(lead.lostReason ?? LOST_REASONS[0]);
  const [convClass, setConvClass] = useState(lead.trialClassId ?? guess ?? classes[0]?.id ?? "");
  const [adult, setAdult] = useState(false);
  const [parentName, setParentName] = useState("");
  const manage = app.canManage;
  const done = lead.status === "enrolled";
  const update = (p: Omit<CommandMap["lead.update"], "id">, ok: string) => run(() => app.run("lead.update", { id: lead.id, ...p }), ok);

  const convert = async () => {
    const p = await run(() => app.run("lead.convert", { id: lead.id, classId: convClass, adult, parentName: adult ? undefined : parentName }), t("O'quvchi qo'shildi"));
    const sid = p?.upsert?.students?.[0]?.id;
    if (sid) onConverted(sid);
  };
  const remove = async () => {
    if (!(await ask(t("{name} lidlar ro'yxatidan o'chirilsinmi?", { name: lead.name }), { ok: t("O'chirish"), danger: true }))) return;
    if (await run(() => app.run("lead.delete", { id: lead.id }), t("O'chirildi"))) onClose();
  };

  return (
    <Modal open onClose={onClose} title={lead.name}
      footer={manage && !done && mode === "view" ? <>
        <button type="button" className={cx(btn.outline, "mr-auto")} onClick={remove} aria-label={t("O'chirish")}><Trash2 size={16} /></button>
        <button type="button" className={btn.outline} onClick={onEdit}>{t("Tahrirlash")}</button>
        <button type="button" className={btn.primary} onClick={() => setMode("convert")}><UserPlus size={16} aria-hidden /> {t("O'quvchi qilish")}</button>
      </> : <button type="button" className={btn.outline} onClick={mode === "view" ? onClose : () => setMode("view")}>{mode === "view" ? t("Yopish") : t("Orqaga")}</button>}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={STATUS_TONE[lead.status]}>{t(`lead.st.${lead.status}`)}</Pill>
          <span className="text-sm text-muted">{t(`lead.src.${lead.source}`)} · {fmt.dateFull(lead.createdAt)}</span>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted">{t("Telefon")}</dt>
          <dd className="tabular flex items-center gap-2">{fmt.phone(lead.phone)}<a href={`tel:+${lead.phone}`} className="text-primary" aria-label={t("Qo'ng'iroq")}><Phone size={15} /></a></dd>
          <dt className="text-muted">{t("Qiziqishi")}</dt><dd>{lead.interest || "—"}</dd>
          {lead.trialDay && <><dt className="text-muted">{t("Sinov darsi")}</dt><dd>{fmt.dateFull(lead.trialDay)} · {app.schoolClass(lead.trialClassId ?? "")?.name}
            {lead.trialCame === true ? ` · ${t("keldi")}` : lead.trialCame === false ? ` · ${t("kelmadi")}` : ""}</dd></>}
          {lead.note && <><dt className="text-muted">{t("Izoh")}</dt><dd className="whitespace-pre-wrap">{lead.note}</dd></>}
          {lead.lostReason && <><dt className="text-muted">{t("Sabab")}</dt><dd>{lead.lostReason}</dd></>}
        </dl>

        {done && lead.studentId && (
          <a href={`/director/students/${lead.studentId}`} className={btn.outline}>{t("O'quvchi sahifasini ochish")}</a>
        )}

        {manage && !done && mode === "view" && (
          <div className="flex flex-col gap-2 rounded-xl border border-line p-3">
            <div className="text-xs font-semibold tracking-wide text-muted uppercase">{t("Keyingi qadam")}</div>
            <div className="flex flex-wrap gap-2">
              {lead.status === "new" && <button type="button" className={btn.sm} onClick={() => update({ status: "contacted" }, t("Saqlandi"))}><Phone size={15} aria-hidden /> {t("Bog'lanildi")}</button>}
              <button type="button" className={btn.sm} onClick={() => setMode("trial")}><CalendarClock size={15} aria-hidden /> {lead.trialDay ? t("Sinov darsini o'zgartirish") : t("Sinov darsiga yozish")}</button>
              {lead.status === "trial" && lead.trialCame === undefined && <>
                <button type="button" className={btn.sm} onClick={() => update({ trialCame: true }, t("Saqlandi"))}><Check size={15} className="text-ok" aria-hidden /> {t("Sinovga keldi")}</button>
                <button type="button" className={btn.sm} onClick={() => update({ trialCame: false }, t("Saqlandi"))}><X size={15} className="text-bad" aria-hidden /> {t("Kelmadi")}</button>
              </>}
              {lead.status !== "lost"
                ? <button type="button" className={btn.sm} onClick={() => setMode("lost")}>{t("Rad etdi")}</button>
                : <button type="button" className={btn.sm} onClick={() => update({ status: "contacted", lostReason: "" }, t("Saqlandi"))}>{t("Qayta ochish")}</button>}
            </div>
          </div>
        )}

        {mode === "trial" && (
          <div className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-2">
            <Field label={t("Guruh")}>
              <Select value={trialClass} onChange={setTrialClass}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
            </Field>
            <Field label={t("Sana")}><input type="date" className={inputCls} value={trialDay} onChange={(e) => setTrialDay(e.target.value)} /></Field>
            <TrialLessons classId={trialClass} day={trialDay} />
            <button type="button" className={cx(btn.primary, "sm:col-span-2")} disabled={!trialClass || !trialDay}
              onClick={async () => { if (await update({ trialClassId: trialClass, trialDay, trialCame: null }, t("Sinov darsiga yozildi"))) setMode("view"); }}>{t("Saqlash")}</button>
          </div>
        )}

        {mode === "lost" && (
          <div className="flex flex-col gap-3 rounded-xl border border-line p-3">
            <Field label={t("Sabab")}>
              <input className={inputCls} list="lost-reasons" value={lostReason} onChange={(e) => setLostReason(e.target.value)} />
              <datalist id="lost-reasons">{LOST_REASONS.map((r) => <option key={r} value={r}>{t(r)}</option>)}</datalist>
            </Field>
            <button type="button" className={btn.primary} onClick={async () => { if (await update({ status: "lost", lostReason }, t("Saqlandi"))) setMode("view"); }}>{t("Saqlash")}</button>
          </div>
        )}

        {mode === "convert" && (
          <div className="flex flex-col gap-3 rounded-xl border border-line p-3">
            <Field label={t("Guruh")}>
              <Select value={convClass} onChange={setConvClass}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="size-4 accent-[var(--color-primary)]" />
              {t("Katta yoshli (o'zi to'laydi, ota-onasiz)")}
            </label>
            {adult
              ? <p className="text-xs text-muted">{t("Telefon raqami o'quvchining o'ziga login bo'ladi.")}</p>
              : <Field label={t("Ota-ona ismi")} hint={t("Telefon raqami ota-onaniki deb yoziladi")}>
                  <input className={inputCls} value={parentName} onChange={(e) => setParentName(e.target.value)} placeholder={t("Masalan: Karimova Dilnoza")} />
                </Field>}
            <button type="button" className={btn.primary} disabled={!convClass} onClick={convert}><UserPlus size={16} aria-hidden /> {t("O'quvchi qilish")}</button>
          </div>
        )}
      </div>
      {dialog}
    </Modal>
  );
}

/** Tanlangan kunda guruhning darslari (sinov darsi vaqtini aytish uchun). */
function TrialLessons({ classId, day }: { classId: string; day: string }) {
  const app = useApp();
  const t = useT();
  const ls = day ? app.lessonsOfClassOn(classId, isoWeekday(day)) : [];
  return (
    <p className={cx("text-sm sm:col-span-2", ls.length ? "text-muted" : "text-warn")}>
      {ls.length ? ls.map((l) => `${l.start}–${l.end} · ${l.subject}${l.room ? ` · ${l.room}` : ""}`).join("; ") : t("Bu kunda guruhning darsi yo'q")}
    </p>
  );
}
