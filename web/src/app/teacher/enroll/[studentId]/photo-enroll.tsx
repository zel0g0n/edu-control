"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CircleAlert, CircleCheck, ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import type { Student } from "@edunazorat/shared";

import { PageBody, PageHeader } from "@/components/shell";
import { Avatar, btn, Card, cx, Modal } from "@/components/ui";
import { useApp } from "@/lib/data/store";
import { faceWorker } from "@/lib/face/client";
import { analysePhoto } from "@/lib/face/photo";
import { t as tr } from "@/lib/i18n";
import { useT } from "@/lib/i18n/react";
import { findDuplicate, samplesConsistent, useSaveEnrollment } from "./enroll-shared";

/** Bir o'quvchiga ko'pi bilan shuncha rasm (har biri bitta namuna). */
const MAX_PHOTOS = 5;
interface Item {
  id: number;
  /** Ko'rish uchun (faqat shu brauzerda, serverga ketmaydi). */
  preview: string;
  state: "checking" | "ok" | "bad";
  reason?: string;
  embedding?: Float32Array;
  /** Kichik yuz kesimi (o'qituvchi ro'yxati va ota-ona uchun). */
  crop?: string;
  /** To'g'ridan qaragan (asosiy surat uchun afzal). */
  frontal?: boolean;
}

/**
 * Tayyor rasmdan (galereya) yuz namunasi: o'quvchi yonida bo'lmaganda yoki kamera bilan olish qiyin bo'lsa.
 * Rasm qurilmadan chiqmaydi — tahlil brauzerda, serverga faqat raqamli namuna va kichik yuz kesimi.
 */
export function PhotoEnroll({ student: s, backHref, onCamera }: { student: Student; backHref: string; onCamera: () => void }) {
  const app = useApp();
  const t = useT();
  const save = useSaveEnrollment(s, backHref);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ name: string; score: number } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    faceWorker.init().then(() => setStatus("ready")).catch(() => setStatus("error"));
  }, []);
  // Ko'rish havolalari bo'shatiladi
  const previews = useRef<string[]>([]);
  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    const room = MAX_PHOTOS - items.length;
    const list = [...files].slice(0, Math.max(0, room));
    if (files.length > room) setError(t("Ko'pi bilan {n} ta rasm", { n: MAX_PHOTOS }));
    // Navbat bilan (model bitta): har biri tayyor bo'lishi bilan ko'rinadi
    for (const file of list) {
      const id = ++seq.current;
      const preview = URL.createObjectURL(file);
      previews.current.push(preview);
      setItems((xs) => [...xs, { id, preview, state: "checking" }]);
      const r = await analysePhoto(file).catch(() => ({ state: "bad" as const, reason: tr("Yuzni o'qib bo'lmadi") }));
      setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...r } : x)));
    }
    if (input.current) input.current.value = "";
  };

  const remove = (id: number) => setItems((xs) => xs.filter((x) => x.id !== id));

  const good = items.filter((x) => x.state === "ok" && x.embedding);
  const checking = items.some((x) => x.state === "checking");

  const finish = async (force = false) => {
    const embs = good.map((x) => x.embedding!);
    if (!embs.length) return;
    // Rasmlar bitta odamniki bo'lishi kerak (adashib boshqa bolaning rasmi qo'shilmasin)
    if (!samplesConsistent(embs)) return setError(t("Rasmlar bir-biriga o'xshamayapti: hammasi shu o'quvchiniki ekanini tekshiring"));
    if (!force) {
      const dup = findDuplicate(app, s, embs);
      if (dup) return setDuplicate(dup);
    }
    const main = good.find((x) => x.frontal) ?? good[0];
    setSaving(true);
    await save(embs, main.crop);
    setSaving(false);
  };

  return (
    <>
      <PageHeader title={s.name} subtitle={t("Yuz namunasi rasmdan")} back={backHref}
        actions={<button type="button" className={btn.sm} onClick={onCamera}><Camera size={16} aria-hidden /> {t("Kamera bilan olish")}</button>} />
      <PageBody className="max-w-3xl">
        <Card className="p-5">
          <ul className="flex flex-col gap-1.5 text-sm text-muted">
            <li>{t("Faqat shu o'quvchi ko'ringan, yuzi aniq va yorug' rasm tanlang (hujjat surati kabi).")}</li>
            <li>{t("2–3 ta har xil rasm (biri to'g'ridan) tanib olishni aniqroq qiladi.")}</li>
            <li>{t("Rasm serverga yuborilmaydi: tahlil shu qurilmada, faqat raqamli namuna va kichik yuz kesimi saqlanadi.")}</li>
          </ul>

          <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => void add(e.target.files)} />
          <button type="button" disabled={status !== "ready" || items.length >= MAX_PHOTOS || checking}
            onClick={() => input.current?.click()}
            className={cx("mt-5 flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line px-4 py-8 text-center transition hover:border-primary hover:bg-primary-soft/30 disabled:opacity-60")}>
            {status === "loading" ? <LoaderCircle size={28} className="animate-spin text-muted" aria-hidden /> : <ImagePlus size={28} className="text-primary" aria-hidden />}
            <span className="font-semibold">{status === "loading" ? t("Model yuklanmoqda…") : status === "error" ? t("Yuz tanish modeli yuklanmadi") : t("Rasm tanlash")}</span>
            <span className="text-xs text-muted">{t("{n} / {max} ta rasm", { n: items.length, max: MAX_PHOTOS })}</span>
          </button>

          {items.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2">
              {items.map((x) => (
                <li key={x.id} className="flex items-center gap-3 rounded-xl border border-line p-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={x.preview} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
                  {x.crop ? <Avatar name={s.name} image={x.crop} size={40} /> : null}
                  <div className="min-w-0 flex-1 text-sm">
                    {x.state === "checking" && <span className="flex items-center gap-1.5 text-muted"><LoaderCircle size={15} className="animate-spin" aria-hidden /> {t("Tekshirilmoqda…")}</span>}
                    {x.state === "ok" && <span className="flex items-center gap-1.5 font-medium text-ok"><CircleCheck size={15} aria-hidden /> {x.frontal ? t("Yaroqli (to'g'ridan)") : t("Yaroqli")}</span>}
                    {x.state === "bad" && <span className="flex items-start gap-1.5 text-bad"><CircleAlert size={15} className="mt-0.5 shrink-0" aria-hidden /> {x.reason}</span>}
                  </div>
                  <button type="button" className={btn.icon} onClick={() => remove(x.id)} aria-label={t("O'chirish")}><Trash2 size={17} aria-hidden /></button>
                </li>
              ))}
            </ul>
          )}

          {error && <p role="alert" className="mt-3 text-sm font-medium text-bad">{error}</p>}

          <button type="button" className={cx(btn.primary, "mt-5 w-full")} disabled={!good.length || checking || saving} onClick={() => void finish()}>
            {saving ? t("Saqlanmoqda…") : t("Namunani saqlash ({n} ta rasm)", { n: good.length })}
          </button>
          {s.faceTemplates.length > 0 && <p className="mt-2 text-center text-xs text-muted">{t("Avvalgi namuna yangisi bilan almashtiriladi.")}</p>}
        </Card>
      </PageBody>

      <Modal open={!!duplicate} onClose={() => setDuplicate(null)} title={t("O'xshash yuz topildi")}>
        <p>{t("Bu yuz {name} namunasiga juda o'xshaydi ({p}%). To'g'ri o'quvchini tanlaganingizga ishonchingiz komilmi?", { name: duplicate?.name ?? "", p: Math.round((duplicate?.score ?? 0) * 100) })}</p>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button type="button" className={btn.outline} onClick={() => setDuplicate(null)}>{t("Bekor qilish")}</button>
          <button type="button" className={btn.primary} onClick={() => { setDuplicate(null); void finish(true); }}>{t("Baribir saqlash")}</button>
        </div>
      </Modal>
    </>
  );
}
