"use client";

import { useState } from "react";
import { Check, Copy, Hash } from "lucide-react";
import { formatReceiptId } from "@edunazorat/shared";

import { cx } from "@/components/ui";
import { useT } from "@/lib/i18n/react";

/** Nusxalash: clipboard yopiq bo'lsa (eski brauzer, http) jim o'tadi. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ota-ona uchun Kvitansiya ID kartasi: katta raqam, nusxalash va nima uchunligi.
 * Administrator "Kvitansiya ID'ingiz qanday?" deb so'raganda ota-ona shu yerdan aytadi.
 */
export function ReceiptIdCard({ id, online, className }: { id?: string; /** Markazda Click/Payme ulanganmi */ online?: boolean; className?: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  if (!id) return null;
  const onCopy = async () => {
    if (await copyText(id)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };
  return (
    <div className={cx("flex items-center gap-3 rounded-2xl border border-line bg-surface p-4", className)}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Hash size={20} aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">{t("Kvitansiya ID")}</div>
        <div className="tabular select-all text-[22px] font-bold tracking-wider">{formatReceiptId(id)}</div>
        <p className="mt-0.5 text-xs text-muted">{online
          ? t("Administrator so'raganda shu raqamni ayting. To'lov havolasida ham shu raqam ko'rsatiladi.")
          : t("Administrator so'raganda shu raqamni ayting. Kassada yoki o'tkazma orqali to'laganda izohga shu raqamni yozing.")}</p>
      </div>
      <button type="button" onClick={onCopy} aria-label={t("Nusxalash")}
        className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-line text-muted transition hover:text-ink">
        {copied ? <Check size={18} className="text-ok" aria-hidden /> : <Copy size={18} aria-hidden />}
      </button>
    </div>
  );
}

/** Jadval va ro'yxatlar uchun ixcham ko'rinish: "№ 104 523". */
export function ReceiptIdText({ id, className }: { id?: string; className?: string }) {
  if (!id) return null;
  return <span className={cx("tabular whitespace-nowrap text-muted", className)}>№ {formatReceiptId(id)}</span>;
}
