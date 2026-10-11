"use client";

import { useMemo, useState } from "react";
import { CalendarPlus, CalendarRange, PartyPopper, Clock, CreditCard, MapPin, Plus, ScanFace, Star, Trash2, Wand2 } from "lucide-react";
import { uzPublicHolidays, type InstitutionSettings, type Term } from "@edunazorat/shared";

import { useRun } from "@/components/providers";
import { PageBody, PageHeader, ReadOnlyNote } from "@/components/shell";
import { btn, Card, cx, Field, inputCls, Pill } from "@/components/ui";
import { useApp } from "@/lib/data/store";
import { FACE, faceThresholds } from "@/lib/face/config";
import { faceDiagnostics } from "@/lib/face/diagnostics";
import { fmt } from "@/lib/format";
import { usableTemplates } from "@/lib/face/matcher";
import { useT } from "@/lib/i18n/react";

import { NvrBlock } from "./nvr-block";

export default function DirectorSettings() {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const inst = app.myInstitution!;
  // Chegaralar boshqa model uchun sozlangan bo'lsa: joriy model standartlari
  const th = faceThresholds(inst.settings);
  const [s, setS] = useState<InstitutionSettings>(() => ({ ...inst.settings, faceModel: FACE.modelId, matchThreshold: th.match, reviewThreshold: th.review, faceLiveness: inst.settings.faceLiveness !== false, payments: { ...inst.settings.payments } }));
  // NVR o'z bloki orqali saqlanadi: solishtirishda hisobga olinmaydi
  const dirty = JSON.stringify({ ...s, nvr: undefined }) !== JSON.stringify({ ...inst.settings, faceModel: FACE.modelId, matchThreshold: th.match, reviewThreshold: th.review, faceLiveness: inst.settings.faceLiveness !== false, nvr: undefined });
  const set = <K extends keyof InstitutionSettings>(k: K, v: InstitutionSettings[K]) => setS({ ...s, [k]: v });
  const setPay = (k: keyof InstitutionSettings["payments"], v: string) => setS({ ...s, payments: { ...s.payments, [k]: v.trim() || undefined } });

  const students = app.studentsOfInstitution(inst.id);
  const diag = useMemo(() => faceDiagnostics(students.map((x) => ({ id: x.id, templates: usableTemplates(x) }))), [students]);

  // Kelgusi 12 oydagi davlat bayramlari (mavjudlari takrorlanmaydi)
  const addPublic = () => {
    const y = Number(app.today.slice(0, 4));
    const until = `${y + 1}${app.today.slice(4)}`;
    const have = new Set((s.holidays ?? []).map((h) => h.from));
    const add = [...uzPublicHolidays(y), ...uzPublicHolidays(y + 1)]
      .filter((h) => h.to >= app.today && h.from <= until && !have.has(h.from))
      .map((h) => ({ ...h, id: "", name: t(h.name) }));
    set("holidays", [...(s.holidays ?? []), ...add].sort((a, b) => a.from.localeCompare(b.from)));
  };

  const save = async () => {
    const p = await run(() => app.run("settings.save", { settings: s }), t("Sozlamalar saqlandi"));
    // Yangi filiallar server bergan id bilan qaytadi: qayta saqlashda takrorlanmasin
    const saved = p?.upsert?.institutions?.[0];
    if (saved) setS((prev) => ({ ...prev, branches: saved.settings.branches, holidays: saved.settings.holidays }));
  };

  return (
    <>
      <PageHeader title={t("Sozlamalar")} subtitle={inst.name}
        actions={app.canManageSettings && <button type="button" className={btn.smPrimary} disabled={!dirty} onClick={save}>{t("Saqlash")}</button>} />
      <PageBody className="max-w-4xl">
        {!app.canManage && <ReadOnlyNote />}
        {app.branchLimited && <p className="mb-4 rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-muted">{t("Siz filial administratorisiz: sozlamalarni markaz administratori yoki direktor o'zgartiradi.")}</p>}
        {/* Direktor sozlamalarni ko'radi, o'zgartirmaydi */}
        <fieldset disabled={!app.canManageSettings} className="flex min-w-0 flex-col gap-4">
          <Block icon={Clock} title={t("Davomat va to'lov muddati")}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("Kechikish (daqiqa)")} hint={t("Dars boshlanganidan shuncha daqiqa o'tib kelsa: \"kechikdi\"")}>
                <input type="number" min={0} max={60} className={inputCls} value={s.lateAfterMinutes} onChange={(e) => set("lateAfterMinutes", Number(e.target.value))} />
              </Field>
              <Field label={t("Oylik to'lov muddati (oyning kuni)")} hint={t("Hisob-varaqlar shu kungacha to'lanishi kerak")}>
                <input type="number" min={1} max={28} className={inputCls} value={s.paymentDueDay} onChange={(e) => set("paymentDueDay", Number(e.target.value))} />
              </Field>
            </div>
          </Block>

          <Block icon={Star} title={t("Baholash")}>
            <label className="flex items-start gap-2.5">
              <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-primary)]" checked={s.gradesEnabled !== false} onChange={(e) => set("gradesEnabled", e.target.checked)} />
              <span className="text-sm">
                <span className="block font-semibold">{t("Baho tizimi yoqilgan")}</span>
                <span className="block text-muted">{t("O'chirilsa jurnal, baholar bo'limi va o'rtacha ball yashiriladi. Ko'p o'quv markazlari baho qo'ymaydi: davomat va to'lov yetarli.")}</span>
              </span>
            </label>
          </Block>

          <Block icon={MapPin} title={t("Filiallar")}>
            <p className="mb-3 text-sm text-muted">
              {t("Bir nechta manzilda dars o'tsangiz filiallarni qo'shing: guruhlarni filialga biriktirasiz, ro'yxat va to'lovlarni filial bo'yicha ko'rasiz. Bitta manzil bo'lsa bo'sh qoldiring.")}
            </p>
            <div className="flex flex-col gap-2">
              {(s.branches ?? []).map((b, i) => {
                const used = app.classesOfInstitution(inst.id).filter((c) => c.branchId && c.branchId === b.id).length;
                const upd = (patch: Partial<typeof b>) => set("branches", (s.branches ?? []).map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <div key={b.id || `new${i}`} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
                    <input className={inputCls} value={b.name} placeholder={t("Nomi (masalan: Chilonzor)")} aria-label={t("Filial nomi")} onChange={(e) => upd({ name: e.target.value })} />
                    <input className={inputCls} value={b.address ?? ""} placeholder={t("Manzil (ixtiyoriy)")} aria-label={t("Manzil")} onChange={(e) => upd({ address: e.target.value })} />
                    <button type="button" className={btn.icon} disabled={used > 0} title={used ? t("{n} ta guruh biriktirilgan", { n: used }) : undefined}
                      aria-label={t("Olib tashlash")} onClick={() => set("branches", (s.branches ?? []).filter((_, j) => j !== i))}><Trash2 size={17} /></button>
                  </div>
                );
              })}
              {app.canManageSettings && (
                <button type="button" className={cx(btn.sm, "self-start")} onClick={() => set("branches", [...(s.branches ?? []), { id: "", name: "" }])}>
                  <Plus size={15} aria-hidden /> {t("Filial qo'shish")}
                </button>
              )}
            </div>
          </Block>

          <Block icon={PartyPopper} title={t("Dam olish kunlari")}>
            <p className="mb-3 text-sm text-muted">
              {t("Bayram va ta'til kunlari: bu kunlarda dars bo'lmaydi. Darsbay to'lovda va o'qituvchi ulushida dars soniga kirmaydi; oylik narx o'zgarmaydi. O'qituvchi, ota-ona va o'quvchilar bir kun oldin eslatma ko'radi.")}
            </p>
            <div className="flex flex-col gap-2">
              {(s.holidays ?? []).map((h, i) => {
                const upd = (patch: Partial<typeof h>) => set("holidays", (s.holidays ?? []).map((x, j) => (j === i ? { ...x, ...patch } : x)));
                const past = (h.to || h.from) < app.today;
                return (
                  <div key={h.id || `new${i}`} className={cx("grid gap-2 sm:grid-cols-[1.4fr_1fr_1fr_auto]", past && "opacity-60")}>
                    <input className={inputCls} value={h.name} placeholder={t("Nomi (masalan: Navro'z)")} aria-label={t("Nomi")} onChange={(e) => upd({ name: e.target.value })} />
                    <input type="date" className={inputCls} value={h.from} aria-label={t("Boshlanishi")} onChange={(e) => upd({ from: e.target.value, to: !h.to || h.to < e.target.value ? e.target.value : h.to })} />
                    <input type="date" className={inputCls} value={h.to} min={h.from} aria-label={t("Tugashi")} onChange={(e) => upd({ to: e.target.value })} />
                    <button type="button" className={btn.icon} aria-label={t("Olib tashlash")} onClick={() => set("holidays", (s.holidays ?? []).filter((_, j) => j !== i))}><Trash2 size={17} /></button>
                  </div>
                );
              })}
              {app.canManageSettings && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={btn.sm} onClick={() => set("holidays", [...(s.holidays ?? []), { id: "", name: "", from: app.today, to: app.today }])}>
                    <Plus size={15} aria-hidden /> {t("Dam olish kuni qo'shish")}
                  </button>
                  <button type="button" className={btn.sm} onClick={addPublic}>
                    <CalendarPlus size={15} aria-hidden /> {t("Davlat bayramlarini qo'shish")}
                  </button>
                </div>
              )}
            </div>
          </Block>

          <Block icon={CreditCard} title={t("Onlayn to'lov (Click, Payme)")}>
            <p className="mb-3 text-sm text-muted">
              {t("Merchant ma'lumotlarini Click va Payme bilan shartnoma tuzgach, ularning kabinetidan oling. Kiritilgach, ota-onalar ilovadan haqiqiy to'lov qila oladi; to'lov tasdig'ini server qabul qiladi.")}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Click service_id"><input className={inputCls} value={s.payments.clickServiceId ?? ""} onChange={(e) => setPay("clickServiceId", e.target.value)} /></Field>
              <Field label="Click merchant_id"><input className={inputCls} value={s.payments.clickMerchantId ?? ""} onChange={(e) => setPay("clickMerchantId", e.target.value)} /></Field>
              <Field label="Payme merchant ID"><input className={inputCls} value={s.payments.paymeMerchantId ?? ""} onChange={(e) => setPay("paymeMerchantId", e.target.value)} /></Field>
              <Field label={t("Payme hisob maydoni")} hint="order_id"><input className={inputCls} value={s.payments.paymeAccountField ?? ""} placeholder="order_id" onChange={(e) => setPay("paymeAccountField", e.target.value)} /></Field>
            </div>
            <div className="mt-3 flex gap-2">
              <Pill tone={s.payments.clickServiceId && s.payments.clickMerchantId ? "ok" : "slate"}>Click: {s.payments.clickServiceId && s.payments.clickMerchantId ? t("ulangan") : t("demo")}</Pill>
              <Pill tone={s.payments.paymeMerchantId ? "ok" : "slate"}>Payme: {s.payments.paymeMerchantId ? t("ulangan") : t("demo")}</Pill>
            </div>
          </Block>

          <Block icon={ScanFace} title={t("Yuz tanish")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("\"Tanildi\" chegarasi: {v}", { v: s.matchThreshold.toFixed(2) })} hint={t("Yuqori: xato tanish kamayadi, lekin ko'proq qo'lda tasdiqlash kerak")}>
                <input type="range" min={0.3} max={0.75} step={0.01} value={s.matchThreshold} onChange={(e) => set("matchThreshold", Number(e.target.value))} className="accent-[var(--primary)]" />
              </Field>
              <Field label={t("\"Tekshiring\" chegarasi: {v}", { v: s.reviewThreshold.toFixed(2) })} hint={t("Shundan past o'xshashlik: noma'lum yuz")}>
                <input type="range" min={0.15} max={0.7} step={0.01} value={s.reviewThreshold} onChange={(e) => set("reviewThreshold", Number(e.target.value))} className="accent-[var(--primary)]" />
              </Field>
            </div>
            <label className="mt-4 flex items-start gap-3">
              <input type="checkbox" className="mt-1 size-4 accent-[var(--primary)]" checked={s.faceLiveness} onChange={(e) => set("faceLiveness", e.target.checked)} />
              <span>
                <span className="block font-semibold">{t("Jonlilik tekshiruvi")}</span>
                <span className="block text-sm text-muted">{t("Kameraga yaqin turgan yuz qimirlamasa (qog'ozdagi rasm yoki telefon ekrani), u avtomatik \"keldi\" qilinmaydi: o'qituvchi tasdiqlaydi.")}</span>
              </span>
            </label>

            <div className="mt-5 rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex-1 font-semibold">{t("Diagnostika: sizning o'quvchilaringiz namunalari")}</span>
                {diag.suggested && (
                  <button type="button" className={btn.sm} onClick={() => setS({ ...s, matchThreshold: diag.suggested!.match, reviewThreshold: diag.suggested!.review })}>
                    <Wand2 size={15} aria-hidden /> {t("Tavsiyani qo'llash")}
                  </button>
                )}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Stat label={t("Namunasi bor")} value={`${diag.students}/${students.length}`} />
                <Stat label={t("Eng o'xshash 2 xil o'quvchi")} value={diag.maxImpostor === null ? "—" : diag.maxImpostor.toFixed(2)} tone={diag.maxImpostor !== null && diag.maxImpostor >= s.matchThreshold ? "text-bad" : undefined} />
                <Stat label={t("Bir o'quvchi, eng past")} value={diag.minGenuine === null ? "—" : diag.minGenuine.toFixed(2)} tone={diag.minGenuine !== null && diag.minGenuine < s.matchThreshold ? "text-warn" : undefined} />
                <Stat label={t("Tavsiya")} value={diag.suggested ? `${diag.suggested.match.toFixed(2)} / ${diag.suggested.review.toFixed(2)}` : "—"} />
              </dl>
              {diag.impostor.length > 0 && <Histogram genuine={diag.genuine} impostor={diag.impostor} match={s.matchThreshold} review={s.reviewThreshold} />}
              <p className="mt-3 text-xs text-muted">
                {diag.suggested
                  ? t("Tavsiya: eng o'xshash ikki xil o'quvchidan 0.10 yuqori. Aka-uka va egizaklar shu ko'rsatkichni oshiradi: ular uchun o'qituvchi tasdig'i so'raladi.")
                  : t("Tavsiya uchun kamida 5 o'quvchining yuz namunasi kerak. Hozircha kattalar suratlarida sinalgan standart qiymatlar ishlatiladi (0.40 / 0.28).")}
              </p>
            </div>
          </Block>

          <NvrBlock />

          <Block icon={CalendarRange} title={t("O'quv choraklari")}>
            <div className="flex flex-col gap-2">
              {app.termsOf(inst.id).map((term) => <TermRow key={term.id} term={term} />)}
            </div>
          </Block>
        </fieldset>
        {app.canManageSettings && dirty && (
          <div className="sticky bottom-24 mt-4 flex justify-end md:bottom-4">
            <button type="button" className={cx(btn.primary, "shadow-lg")} onClick={save}>{t("O'zgarishlarni saqlash")}</button>
          </div>
        )}
      </PageBody>
    </>
  );
}

function Block({ icon: Icon, title, children }: { icon: typeof Clock; title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="mb-4 flex items-center gap-2 text-[15px] font-bold"><Icon size={18} className="text-primary" aria-hidden />{title}</h2>
      {children}
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={cx("tabular text-lg font-bold", tone)}>{value}</dd>
    </div>
  );
}

/** O'xshashlik taqsimoti: bir xil o'quvchi (yashil) va turli o'quvchilar (qizil). */
function Histogram({ genuine, impostor, match, review }: { genuine: number[]; impostor: number[]; match: number; review: number }) {
  const t = useT();
  const bins = 20;
  const lo = -0.2, hi = 1;
  const bin = (v: number) => Math.min(bins - 1, Math.max(0, Math.floor(((v - lo) / (hi - lo)) * bins)));
  const g = Array(bins).fill(0), im = Array(bins).fill(0);
  genuine.forEach((v) => g[bin(v)]++);
  impostor.forEach((v) => im[bin(v)]++);
  const gm = Math.max(1, ...g), imMax = Math.max(1, ...im);
  const W = 400, H = 90;
  const x = (v: number) => ((v - lo) / (hi - lo)) * W;
  return (
    <div className="mt-4">
      <svg viewBox={`0 0 ${W} ${H + 16}`} className="h-auto w-full" role="img" aria-label={t("O'xshashlik taqsimoti")}>
        {im.map((n, i) => <rect key={`i${i}`} x={(i * W) / bins + 1} y={H - (n / imMax) * H * 0.95} width={W / bins - 2} height={(n / imMax) * H * 0.95} fill="var(--bad)" opacity="0.55" />)}
        {g.map((n, i) => <rect key={`g${i}`} x={(i * W) / bins + 3} y={H - (n / gm) * H * 0.95} width={W / bins - 6} height={(n / gm) * H * 0.95} fill="var(--ok)" opacity="0.75" />)}
        <line x1={x(match)} x2={x(match)} y1={0} y2={H} stroke="var(--ink)" strokeWidth="2" />
        <line x1={x(review)} x2={x(review)} y1={0} y2={H} stroke="var(--warn)" strokeWidth="2" strokeDasharray="4 3" />
        {[0, 0.5, 1].map((v) => <text key={v} x={x(v)} y={H + 13} fontSize="10" textAnchor="middle" fill="var(--muted)">{v}</text>)}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-ok" />{t("bir o'quvchi")}</span>
        <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-bad/60" />{t("turli o'quvchilar")}</span>
        <span className="flex items-center gap-1"><span className="h-3 w-0.5 bg-ink" />{t("tanildi")}</span>
        <span className="flex items-center gap-1"><span className="h-3 w-0.5 bg-warn" />{t("tekshiring")}</span>
      </div>
    </div>
  );
}

function TermRow({ term }: { term: Term }) {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const [name, setName] = useState(term.name);
  const [start, setStart] = useState(term.startDay);
  const [end, setEnd] = useState(term.endDay);
  const changed = name !== term.name || start !== term.startDay || end !== term.endDay;
  const current = term.startDay <= app.today && app.today <= term.endDay;
  return (
    <div className={cx("grid items-end gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]", current ? "border-primary/50" : "border-line")}>
      <Field label={current ? `${t("Nomi")} · ${t("joriy")}` : t("Nomi")}><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label={t("Boshlanishi")}><input type="date" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
      <Field label={t("Tugashi")}><input type="date" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      <button type="button" className={btn.sm} disabled={!changed}
        onClick={() => run(() => app.run("term.save", { id: term.id, name, startDay: start, endDay: end }), t("{n} saqlandi: {a} – {b}", { n: name, a: fmt.date(start), b: fmt.date(end) }))}>
        {t("Saqlash")}
      </button>
    </div>
  );
}
