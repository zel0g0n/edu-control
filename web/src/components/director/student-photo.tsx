"use client";

import { useRef, useState } from "react";
import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react";

import { useT } from "@/lib/i18n/react";
import { Avatar, btn, cx } from "../ui";

/** Tanlangan yangi rasm (tekshirilgan yuz kesimi va raqamli namuna) yoki mavjudini o'chirish. */
export type PhotoChoice = { crop: string; embedding: Float32Array } | "remove";

/**
 * O'quvchi rasmi (qo'shish/tahrirlash oynasida). Rasm brauzerda tekshiriladi (bitta aniq yuz), serverga faqat
 * kichik yuz kesimi ketadi. Yuz namunasi faqat ota-ona roziligi bilan: rozilik bo'lsa darhol, aks holda
 * ota-ona rozilik bergach (o'qituvchi kamerasi ochilganda) shu rasmdan avtomatik.
 */
export function StudentPhotoField({ name, current, removable, consent, value, onChange }: {
  name: string;
  current?: string;
  /** Mavjud rasmni o'chirish mumkin (yuz namunasi hali olinmagan, faqat yuklangan rasm). */
  removable: boolean;
  consent: boolean;
  value: PhotoChoice | null;
  onChange: (v: PhotoChoice | null) => void;
}) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"model" | "check" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file?: File) => {
    if (!file) return;
    setError(null);
    setBusy("model");
    try {
      // Yuz tanish kodi va modeli faqat rasm tanlanganda yuklanadi
      const [{ faceWorker }, { analysePhoto }] = await Promise.all([import("@/lib/face/client"), import("@/lib/face/photo")]);
      await faceWorker.init();
      setBusy("check");
      const r = await analysePhoto(file);
      if (r.state === "ok" && r.crop && r.embedding) onChange({ crop: r.crop, embedding: r.embedding });
      else setError(r.reason ?? t("Yuzni o'qib bo'lmadi"));
    } catch {
      setError(t("Yuz tanish modeli yuklanmadi"));
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  };

  const shown = value && value !== "remove" ? value.crop : value === "remove" ? undefined : current;
  return (
    <div className="mt-4 rounded-xl border border-line p-3">
      <div className="flex items-center gap-3">
        <Avatar name={name || "?"} image={shown} size={64} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-muted">{t("O'quvchi rasmi")}</div>
          <p className="mt-0.5 text-xs text-muted">
            {consent
              ? t("Ota-ona roziligi bor: saqlanganda kamera davomati uchun yuz namunasi shu rasmdan olinadi.")
              : t("Ota-ona rozilik bergach, kamera davomati uchun yuz namunasi shu rasmdan avtomatik tayyorlanadi.")}
          </p>
        </div>
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button type="button" className={btn.sm} disabled={!!busy} onClick={() => input.current?.click()}>
          {busy ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <ImagePlus size={15} aria-hidden />}
          {busy === "model" ? t("Model yuklanmoqda…") : busy === "check" ? t("Tekshirilmoqda…") : shown ? t("Boshqa rasm") : t("Rasm yuklash")}
        </button>
        {value && value !== "remove" && (
          <button type="button" className={btn.sm} disabled={!!busy} onClick={() => onChange(null)}>{t("Bekor qilish")}</button>
        )}
        {!value && current && removable && (
          <button type="button" className={cx(btn.sm, "text-bad")} disabled={!!busy} onClick={() => onChange("remove")}>
            <Trash2 size={15} aria-hidden /> {t("O'chirish")}
          </button>
        )}
        {value === "remove" && (
          <button type="button" className={btn.sm} onClick={() => onChange(null)}>{t("Qaytarish")}</button>
        )}
      </div>
      {error && <p role="alert" className="mt-2 text-xs font-medium text-bad">{error}</p>}
    </div>
  );
}
