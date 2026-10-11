"use client";

import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import {
  DEFAULT_SLOTS, invoiceRemaining, type AbsenceRefund, type AppUser, type BillingMode, type Invoice, type Lesson, type PaymentMethod, type SchoolClass, type Student, type TeacherPay,
} from "@edunazorat/shared";

import { usePriceLabel } from "@/components/invoice-lines";
import { useApp } from "@/lib/data/store";
import { fmt, weekdayName } from "@/lib/format";
import { useT } from "@/lib/i18n/react";
import { useRun } from "../providers";
import { btn, Chip, cx, Field, inputCls, Modal, Segmented, Select, useConfirm } from "../ui";

/** Telefon maydoni: +998 prefiksi bilan. */
export function PhoneInput({ value, onChange, id, placeholder = "90 123 45 67" }: { value: string; onChange: (v: string) => void; id?: string; placeholder?: string }) {
  const digits = value.replace(/\D/g, "").replace(/^998/, "").slice(0, 9);
  return (
    <div className="flex">
      <span className="flex h-11 items-center rounded-l-xl border border-r-0 border-line bg-surface-2 px-3 text-sm font-semibold">+998</span>
      <input id={id} inputMode="numeric" className={cx(inputCls, "tabular rounded-l-none")} placeholder={placeholder}
        value={fmt.phoneLocal(digits)} onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 9))} />
    </div>
  );
}

// ------------------------------------------------------------------ o'quvchi

export function StudentForm({ student, defaultClassId, onClose }: { student?: Student; defaultClassId?: string; onClose: (savedId?: string) => void }) {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const inst = app.myInstitution!;
  const classes = app.classesOfInstitution(inst.id);
  const existingParents = student ? app.parentsOfStudent(student.id) : [];
  const studentUser = student?.userId ? app.userById(student.userId) : undefined;
  const [name, setName] = useState(student?.name ?? "");
  const [classId, setClassId] = useState(student?.classId ?? defaultClassId ?? classes[0]?.id ?? "");
  const [birthDay, setBirthDay] = useState(student?.birthDay ?? "");
  const [parents, setParents] = useState(existingParents.length ? existingParents.map((p) => ({ name: p.name, phone: p.phone.slice(3) })) : [{ name: "", phone: "" }]);
  const [studentPhone, setStudentPhone] = useState(studentUser?.phone ? studentUser.phone.slice(3) : "");
  const [busy, setBusy] = useState(false);
  // O'quv markazi: bir nechta guruh va katta yoshli (ota-onasiz) tinglovchi
  const center = inst.type === "center";
  const [extra, setExtra] = useState<string[]>(student?.extraClassIds ?? []);
  const [adult, setAdult] = useState(!!student?.adult);
  const priceLabel = usePriceLabel();
  const toggleGroup = (id: string) => {
    if (id === classId) return;
    setExtra(extra.includes(id) ? extra.filter((x) => x !== id) : [...extra, id]);
  };

  const save = async () => {
    setBusy(true);
    const p = await run(() => app.run("student.save", {
      id: student?.id, name, classId, birthDay: birthDay || undefined,
      extraClassIds: center ? extra.filter((x) => x !== classId) : undefined,
      adult: center ? adult : undefined,
      parents: center && adult ? [] : parents.filter((x) => x.phone.length).map((x) => ({ name: x.name || t("Ota-ona"), phone: `998${x.phone}` })),
      studentPhone: studentPhone ? `998${studentPhone}` : undefined,
    }), student ? t("O'quvchi ma'lumotlari saqlandi") : t("O'quvchi qo'shildi"));
    setBusy(false);
    if (p) onClose(p.upsert?.students?.[0]?.id);
  };

  return (
    <Modal open onClose={() => onClose()} title={student ? t("O'quvchini tahrirlash") : t("Yangi o'quvchi")} wide
      footer={<>
        <button type="button" className={btn.outline} onClick={() => onClose()}>{t("Bekor qilish")}</button>
        <button type="button" className={btn.primary} disabled={busy || !name.trim() || !classId} onClick={save}>{t("Saqlash")}</button>
      </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("Familiya va ism")} className="sm:col-span-2">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} />
        </Field>
        <Field label={center ? t("Asosiy guruh") : t("Sinf")}>
          <Select value={classId} onChange={(v) => { setClassId(v); setExtra(extra.filter((x) => x !== v)); }}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label={t("Tug'ilgan sana")}>
          <input type="date" className={inputCls} value={birthDay} onChange={(e) => setBirthDay(e.target.value)} />
        </Field>
      </div>

      {center && classes.length > 1 && (
        <div className="mt-4">
          <span className="text-[13px] font-semibold text-muted">{t("Qo'shimcha guruhlar")}</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {classes.filter((c) => c.id !== classId).map((c) => (
              <Chip key={c.id} selected={extra.includes(c.id)} onClick={() => toggleGroup(c.id)}>{c.name} · {priceLabel(c)}</Chip>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">{t("O'quvchi bir nechta guruhda o'qisa belgilang: jadval, davomat va oylik to'lov hammasi bo'yicha hisoblanadi.")}</p>
        </div>
      )}

      {center && (
        <label className="mt-4 flex items-start gap-2.5 rounded-xl border border-line p-3">
          <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-primary)]" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
          <span className="text-sm">
            <span className="block font-semibold">{t("Katta yoshli tinglovchi")}</span>
            <span className="block text-muted">{t("Ota-onasi yo'q: baho, davomat va to'lov xabarlari o'ziga boradi.")}</span>
          </span>
        </label>
      )}

      {!(center && adult) && <>
      <div className="mt-5 mb-2 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-muted">{t("Ota-onalar (shu raqam bilan ilovaga kiradi)")}</span>
        {parents.length < 3 && <button type="button" className={btn.ghost} onClick={() => setParents([...parents, { name: "", phone: "" }])}><Plus size={15} aria-hidden /> {t("Qo'shish")}</button>}
      </div>
      <div className="flex flex-col gap-2">
        {parents.map((p, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl border border-line p-2.5 sm:flex-row sm:items-center">
            <input className={cx(inputCls, "sm:flex-1")} placeholder={t("Ism (masalan: Onasi, Feruza)")} value={p.name} aria-label={t("Ota-ona ismi")}
              onChange={(e) => setParents(parents.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
            <div className="flex items-center gap-1 sm:w-64">
              <div className="flex-1"><PhoneInput value={p.phone} onChange={(v) => setParents(parents.map((x, k) => (k === i ? { ...x, phone: v } : x)))} /></div>
              <button type="button" className={btn.icon} aria-label={t("Olib tashlash")} onClick={() => setParents(parents.filter((_, k) => k !== i))}><X size={18} /></button>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted">{t("Raqam tizimda bor bo'lsa (masalan, boshqa farzandi uchun), shu akkauntga biriktiriladi.")}</p>
      </>}

      <Field label={t("O'quvchi telefoni (ixtiyoriy: SMS bilan kirish uchun)")} className="mt-4">
        <PhoneInput value={studentPhone} onChange={setStudentPhone} />
      </Field>
    </Modal>
  );
}

// ------------------------------------------------------------------ o'qituvchi

export function TeacherForm({ teacher, onClose }: { teacher?: AppUser; onClose: () => void }) {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const [name, setName] = useState(teacher?.name ?? "");
  const [phone, setPhone] = useState(teacher?.phone.slice(3) ?? "");
  const [subjects, setSubjects] = useState<string[]>(teacher?.subjects ?? []);
  const [draft, setDraft] = useState("");
  // Ish haqi: tushgan puldan foiz, har bir dars uchun yoki oylik
  const [payMode, setPayMode] = useState<TeacherPay["mode"] | "">(teacher?.pay?.mode ?? "");
  const [payValue, setPayValue] = useState(teacher?.pay ? String(teacher.pay.value) : "");
  const known = [...new Set(app.db.lessons.map((l) => l.subject).concat(app.teachersOfInstitution(app.myInstitution!.id).flatMap((u) => u.subjects)))].sort();
  const addSubject = (s: string) => {
    const v = s.trim();
    if (v && !subjects.includes(v)) setSubjects([...subjects, v]);
    setDraft("");
  };
  const save = async () => {
    const all = draft.trim() ? [...subjects, draft.trim()] : subjects;
    if (await run(() => app.run("teacher.save", {
      id: teacher?.id, name, phone: `998${phone}`, subjects: all,
      pay: payMode ? { mode: payMode, value: Number(payValue.replace(/[^\d.]/g, "")) || 0 } : null,
    }), t("Saqlandi"))) onClose();
  };
  return (
    <Modal open onClose={onClose} title={teacher ? t("O'qituvchini tahrirlash") : t("Yangi o'qituvchi")}
      footer={<>
        <button type="button" className={btn.outline} onClick={onClose}>{t("Bekor qilish")}</button>
        <button type="button" className={btn.primary} disabled={!name.trim() || phone.length !== 9} onClick={save}>{t("Saqlash")}</button>
      </>}>
      <div className="flex flex-col gap-3">
        <Field label={t("Familiya va ism")}><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label={t("Telefon (ilovaga kirish uchun)")}><PhoneInput value={phone} onChange={setPhone} /></Field>
        <Field label={t("Fanlari")} group>
          <div className="flex flex-wrap gap-1.5">
            {subjects.map((s) => (
              <span key={s} className="flex items-center gap-1 rounded-full bg-primary-soft py-1 pr-1 pl-3 text-sm text-primary-ink">
                {s}<button type="button" onClick={() => setSubjects(subjects.filter((x) => x !== s))} aria-label={t("Olib tashlash")} className="rounded-full p-0.5 hover:bg-primary/15"><X size={14} /></button>
              </span>
            ))}
          </div>
          <input className={inputCls} list="subjects-list" value={draft} placeholder={t("Fan nomi va Enter")}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubject(draft); } }} />
          <datalist id="subjects-list">{known.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("Ish haqi turi")}>
            <Select value={payMode} onChange={(v) => setPayMode(v as TeacherPay["mode"] | "")}>
              <option value="">{t("Ko'rsatilmagan")}</option>
              <option value="percent">{t("Tushgan puldan foiz")}</option>
              <option value="perLesson">{t("Har bir dars uchun")}</option>
              <option value="fixed">{t("Oylik (belgilangan)")}</option>
            </Select>
          </Field>
          {payMode && (
            <Field label={payMode === "percent" ? t("Foiz (%)") : t("Summa (so'm)")}>
              <input inputMode="decimal" className={cx(inputCls, "tabular")} value={payMode === "percent" ? payValue : payValue ? Number(payValue).toLocaleString("ru-RU") : ""}
                onChange={(e) => setPayValue(payMode === "percent" ? e.target.value.replace(/[^\d.]/g, "").slice(0, 5) : e.target.value.replace(/\D/g, ""))}
                placeholder={payMode === "percent" ? "40" : payMode === "perLesson" ? "60 000" : "4 000 000"} />
            </Field>
          )}
        </div>
        {payMode && <p className="-mt-1 text-xs text-muted">{t("Faqat direktor va administrator ko'radi. Hisob-kitob: O'qituvchi ulushi bo'limi.")}</p>}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ sinf

export function ClassForm({ cls, onClose }: { cls?: SchoolClass; onClose: () => void }) {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const teachers = app.teachersOfInstitution(app.myInstitution!.id);
  const [name, setName] = useState(cls?.name ?? "");
  const [homeroom, setHomeroom] = useState(cls?.homeroomTeacherId ?? "");
  const [fee, setFee] = useState(cls?.monthlyFee ? String(cls.monthlyFee) : "");
  // O'quv markazi: to'lov turi va qoldirilgan dars chegirmasi
  const center = app.myInstitution?.type === "center";
  const [mode, setMode] = useState<BillingMode>(cls?.billingMode ?? "monthly");
  const [lessonPrice, setLessonPrice] = useState(cls?.lessonPrice ? String(cls.lessonPrice) : "");
  const [coursePrice, setCoursePrice] = useState(cls?.coursePrice ? String(cls.coursePrice) : "");
  const [refund, setRefund] = useState<AbsenceRefund>(cls?.absenceRefund ?? "none");
  const branches = app.myInstitution?.settings.branches ?? [];
  const [branchId, setBranchId] = useState(cls?.branchId ?? "");
  const num = (v: string) => Number(v.replace(/\D/g, "")) || 0;
  const save = async () => {
    if (await run(() => app.run("class.save", {
      id: cls?.id, name, homeroomTeacherId: homeroom || undefined,
      monthlyFee: mode === "monthly" ? num(fee) : 0,
      billingMode: center ? mode : undefined,
      lessonPrice: center && mode === "perLesson" ? num(lessonPrice) : undefined,
      coursePrice: center && mode === "course" ? num(coursePrice) : undefined,
      absenceRefund: center && mode !== "course" ? refund : undefined,
      branchId: branchId || undefined,
    }), t("Saqlandi"))) onClose();
  };
  const moneyInput = (value: string, set: (v: string) => void, placeholder: string) => (
    <input inputMode="numeric" className={cx(inputCls, "tabular")} value={value ? Number(value).toLocaleString("ru-RU") : ""} onChange={(e) => set(e.target.value.replace(/\D/g, ""))} placeholder={placeholder} />
  );
  return (
    <Modal open onClose={onClose} title={cls ? t("Sinfni tahrirlash") : t("Yangi sinf / guruh")}
      footer={<>
        <button type="button" className={btn.outline} onClick={onClose}>{t("Bekor qilish")}</button>
        <button type="button" className={btn.primary} disabled={!name.trim()} onClick={save}>{t("Saqlash")}</button>
      </>}>
      <div className="flex flex-col gap-3">
        <Field label={t("Nomi")}><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Masalan: 8-A yoki IELTS B2")} autoFocus /></Field>
        <Field label={t("Sinf rahbari")}>
          <Select value={homeroom} onChange={setHomeroom}>
            <option value="">{t("Tanlanmagan")}</option>
            {teachers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
        {branches.length > 0 && (
          <Field label={t("Filial")}>
            <Select value={branchId} onChange={setBranchId}>
              <option value="">{t("Tanlanmagan")}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
        )}
        {center && (
          <Field label={t("To'lov turi")} group>
            <Segmented value={mode} onChange={setMode} options={[
              { value: "monthly", label: t("Oylik") }, { value: "perLesson", label: t("Darsbay") }, { value: "course", label: t("Kurs uchun") },
            ]} />
          </Field>
        )}
        {mode === "monthly" && <Field label={t("Oylik to'lov (so'm)")} hint={center ? t("Oy o'rtasida qo'shilsa yoki chiqsa, o'sha oy dars soniga qarab hisoblanadi") : undefined}>{moneyInput(fee, setFee, "900 000")}</Field>}
        {mode === "perLesson" && <Field label={t("Bitta dars narxi (so'm)")} hint={t("Oy uchun: dars narxi × jadvaldagi darslar soni")}>{moneyInput(lessonPrice, setLessonPrice, "120 000")}</Field>}
        {mode === "course" && <Field label={t("Kurs narxi (so'm)")} hint={t("Guruhga qo'shilgan oyda bir marta hisoblanadi")}>{moneyInput(coursePrice, setCoursePrice, "2 500 000")}</Field>}
        {center && mode !== "course" && (
          <Field label={t("Qoldirilgan dars uchun")} hint={t("Chegirma keyingi oy hisob-varag'ida avtomatik ayriladi")}>
            <Select value={refund} onChange={(v) => setRefund(v as AbsenceRefund)}>
              <option value="none">{t("Chegirma yo'q")}</option>
              <option value="excused">{t("Faqat sababli qoldirilganiga")}</option>
              <option value="all">{t("Har qanday qoldirilgan darsga")}</option>
            </Select>
          </Field>
        )}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ dars

export function LessonForm({ lesson, classId, weekday, slot, onClose }: { lesson?: Lesson; classId?: string; weekday?: number; slot?: [string, string]; onClose: () => void }) {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const { ask, dialog } = useConfirm();
  const inst = app.myInstitution!;
  const classes = app.classesOfInstitution(inst.id);
  const teachers = app.teachersOfInstitution(inst.id);
  const [cid, setCid] = useState(lesson?.classId ?? classId ?? classes[0]?.id ?? "");
  const [teacherId, setTeacherId] = useState(lesson?.teacherId ?? "");
  const [subject, setSubject] = useState(lesson?.subject ?? "");
  const [wd, setWd] = useState(lesson?.weekday ?? weekday ?? 1);
  const [start, setStart] = useState(lesson?.start ?? slot?.[0] ?? "08:30");
  const [end, setEnd] = useState(lesson?.end ?? slot?.[1] ?? "09:15");
  const [room, setRoom] = useState(lesson?.room ?? "");
  const teacher = teachers.find((u) => u.id === teacherId);

  const save = async () => {
    if (await run(() => app.run("lesson.save", { id: lesson?.id, classId: cid, subject, teacherId, weekday: wd, start, end, room }), t("Dars saqlandi"))) onClose();
  };
  const remove = async () => {
    if (!lesson || !(await ask(t("Dars jadvaldan o'chiriladi. Oldingi davomat va baholar saqlanib qoladi."), { danger: true, ok: t("O'chirish") }))) return;
    if (await run(() => app.run("lesson.delete", { id: lesson.id }), t("Dars o'chirildi"))) onClose();
  };

  return (
    <Modal open onClose={onClose} title={lesson ? t("Darsni tahrirlash") : t("Yangi dars")}
      footer={<>
        {lesson && <button type="button" className={cx(btn.outline, "text-bad")} onClick={remove}><Trash2 size={16} aria-hidden /> {t("O'chirish")}</button>}
        <button type="button" className={btn.primary} disabled={!subject.trim() || !teacherId || !cid} onClick={save}>{t("Saqlash")}</button>
      </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("Sinf")}>
          <Select value={cid} onChange={setCid}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        </Field>
        <Field label={t("Kun")}>
          <Select value={String(wd)} onChange={(v) => setWd(Number(v))}>{[1, 2, 3, 4, 5, 6].map((d) => <option key={d} value={d}>{weekdayName(d)}</option>)}</Select>
        </Field>
        <Field label={t("O'qituvchi")}>
          <Select value={teacherId} onChange={(v) => { setTeacherId(v); const u = teachers.find((x) => x.id === v); if (u && !subject && u.subjects[0]) setSubject(u.subjects[0]); }}>
            <option value="">{t("Tanlang")}</option>
            {teachers.map((u) => <option key={u.id} value={u.id}>{u.name}{u.subjects.length ? ` (${u.subjects.join(", ")})` : ""}</option>)}
          </Select>
        </Field>
        <Field label={t("Fan")}>
          <input className={inputCls} list="lesson-subjects" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <datalist id="lesson-subjects">{(teacher?.subjects ?? []).map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label={t("Boshlanishi")}>
          <input type="time" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} list="slot-starts" />
          <datalist id="slot-starts">{DEFAULT_SLOTS.map(([s]) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label={t("Tugashi")}><input type="time" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        <Field label={t("Xona")} className="sm:col-span-2"><input className={inputCls} value={room} onChange={(e) => setRoom(e.target.value)} placeholder="301" /></Field>
      </div>
      <p className="mt-3 text-xs text-muted">{t("Sinf, o'qituvchi yoki xona shu vaqtda band bo'lsa, tizim ogohlantiradi.")}</p>
      {dialog}
    </Modal>
  );
}

// ------------------------------------------------------------------ to'lov

export function PaymentForm({ invoice: inv, onClose }: { invoice: Invoice; onClose: () => void }) {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const rem = invoiceRemaining(inv);
  const [amount, setAmount] = useState(String(rem));
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const s = app.student(inv.studentId);
  const save = async () => {
    if (await run(() => app.run("payment.add", { invoiceId: inv.id, amount: Number(amount), method }), t("To'lov qayd etildi, ota-onaga xabar yuborildi"))) onClose();
  };
  return (
    <Modal open onClose={onClose} title={t("To'lov qabul qilish")}
      footer={<>
        <button type="button" className={btn.outline} onClick={onClose}>{t("Bekor qilish")}</button>
        <button type="button" className={btn.primary} disabled={!(Number(amount) > 0)} onClick={save}>{t("Saqlash")}</button>
      </>}>
      <div className="mb-4 rounded-xl bg-surface-2 p-3 text-sm">
        <div className="font-semibold">{s?.name}</div>
        <div className="text-muted">{fmt.month(inv.month)} · {t("Qoldiq")}: <b className="tabular text-ink">{fmt.money(rem)}</b></div>
      </div>
      <div className="flex flex-col gap-3">
        <Field label={t("Summa (so'm)")}>
          <input inputMode="numeric" className={cx(inputCls, "tabular")} value={amount ? Number(amount).toLocaleString("ru-RU") : ""} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {[rem, Math.round(rem / 2)].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((v) => (
            <button key={v} type="button" className={btn.sm} onClick={() => setAmount(String(v))}>{fmt.money(v)}</button>
          ))}
        </div>
        <Field label={t("To'lov usuli")}>
          <Select value={method} onChange={(v) => setMethod(v as PaymentMethod)}>
            {(["cash", "card", "transfer", "click", "payme"] as PaymentMethod[]).map((m) => <option key={m} value={m}>{t(`pay.${m}`)}</option>)}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

export function AdjustForm({ invoice: inv, onClose }: { invoice: Invoice; onClose: () => void }) {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const [amount, setAmount] = useState(String(inv.amount));
  const [note, setNote] = useState(inv.note ?? "");
  const save = async () => {
    if (await run(() => app.run("invoice.adjust", { id: inv.id, amount: Number(amount), note }), t("Saqlandi"))) onClose();
  };
  return (
    <Modal open onClose={onClose} title={t("Hisobni o'zgartirish (chegirma)")}
      footer={<>
        <button type="button" className={btn.outline} onClick={onClose}>{t("Bekor qilish")}</button>
        <button type="button" className={btn.primary} onClick={save}>{t("Saqlash")}</button>
      </>}>
      <div className="flex flex-col gap-3">
        <Field label={t("Summa (so'm)")}>
          <input inputMode="numeric" className={cx(inputCls, "tabular")} value={amount ? Number(amount).toLocaleString("ru-RU") : "0"} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <Field label={t("Izoh")}><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Masalan: aka-uka chegirmasi 10%")} /></Field>
      </div>
    </Modal>
  );
}
