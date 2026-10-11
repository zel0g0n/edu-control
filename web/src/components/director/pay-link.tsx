"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Download, MessageSquare, Send } from "lucide-react";
import QRCode from "qrcode";
import { formatReceiptId, invoiceRemaining, invoicePaymentLinks, type Invoice } from "@edunazorat/shared";

import { copyText } from "@/components/receipt-id";
import { btn, cx, Modal, Segmented } from "@/components/ui";
import { useApp } from "@/lib/data/store";
import { fmt } from "@/lib/format";
import { useT } from "@/lib/i18n/react";

type Provider = "payme" | "click";

/**
 * To'lov havolasi: administrator ota-onaga Telegram/SMS orqali yuboradi yoki QR qilib chop etadi.
 * Havola Payme/Click'ning o'z sahifasi: summa va hisob-varaq ichida, ota-ona tizimga kirmaydi.
 * To'langach Payme/Click serverga xabar beradi va hisob-varaq o'zi yopiladi.
 */
export function PayLinkModal({ invoice: inv, onClose }: { invoice: Invoice; onClose: () => void }) {
  const app = useApp();
  const t = useT();
  const s = app.student(inv.studentId);
  const cls = app.schoolClass(s?.classId ?? "");
  const cfg = app.institution(s?.institutionId ?? "")?.settings.payments;
  const links = invoicePaymentLinks(cfg, inv);
  const available = (["payme", "click"] as const).filter((p) => links[p]);
  const [provider, setProvider] = useState<Provider>(available[0] ?? "payme");
  // QR rasmi qaysi havola uchun yaratilgani bilan saqlanadi (Payme/Click almashtirilganda eskisi ko'rinmasin)
  const [qrState, setQrState] = useState<{ link: string; url: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const amount = invoiceRemaining(inv);
  const link = links[provider];
  const parents = s ? app.parentsOfStudent(s.id) : [];

  // Ota-onaga yuboriladigan matn: kim, qaysi oy, qancha, Kvitansiya ID va havola(lar)
  const lines = [
    t("Assalomu alaykum! {name} ({cls}) uchun {month} oyi to'lovi: {amount}.", { name: s?.name ?? "", cls: cls?.name ?? "", month: fmt.month(inv.month), amount: fmt.money(amount) }),
    `${t("Kvitansiya ID")}: ${formatReceiptId(s?.receiptId)}`,
  ];
  if (links.payme) lines.push(`${t("Payme orqali to'lash")}: ${links.payme}`);
  if (links.click) lines.push(`${t("Click orqali to'lash")}: ${links.click}`);
  if (!available.length) lines.push(t("To'lovni kassada yoki o'tkazma orqali qiling, izohga Kvitansiya ID'ni yozing."));
  const message = lines.join("\n");
  const qr = qrState && qrState.link === link ? qrState.url : null;

  useEffect(() => {
    if (!link) return;
    let alive = true;
    QRCode.toDataURL(link, { margin: 1, width: 480, errorCorrectionLevel: "M" })
      .then((url) => { if (alive) setQrState({ link, url }); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [link]);

  const doCopy = async (key: string, text: string) => {
    if (await copyText(text)) {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    }
  };

  // Telegram "url" maydoni xabarning boshiga qo'yiladi: butun matnni shu yerda beramiz (havolalar ichida, takrorlanmaydi)
  const tg = `https://t.me/share/url?url=${encodeURIComponent(message)}`;
  const sms = (phone: string) => `sms:+${phone}?body=${encodeURIComponent(message)}`;
  const fileName = `tolov-${s?.receiptId ?? inv.id}-${inv.month}.png`;

  return (
    <Modal open onClose={onClose} title={t("To'lov havolasi")}>
      <div className="rounded-2xl bg-surface-2 p-4 text-center">
        <div className="text-sm text-muted">{s?.name} · {cls?.name} · {fmt.month(inv.month)}</div>
        <div className="tabular mt-1 text-[26px] font-bold tracking-tight">{fmt.money(amount)}</div>
        <div className="tabular text-xs text-muted">{t("Kvitansiya ID")}: <b className="text-ink">{formatReceiptId(s?.receiptId)}</b></div>
      </div>

      {available.length > 0 ? (
        <>
          {available.length > 1 && (
            <div className="mt-4 flex justify-center">
              <Segmented value={provider} onChange={setProvider} options={available.map((p) => ({ value: p as Provider, label: p === "payme" ? "Payme" : "Click" }))} />
            </div>
          )}
          <div className="mt-4 flex flex-col items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- data: URL, optimallashtirish kerak emas */}
            {qr ? <img src={qr} alt={t("To'lov QR-kodi")} className="size-48 rounded-xl border border-line bg-white p-2" /> : <div className="size-48 animate-pulse rounded-xl bg-surface-2" />}
            <p className="text-center text-xs text-muted">{t("Ota-ona {name} ilovasi yoki telefon kamerasi bilan skanerlaydi.", { name: provider === "payme" ? "Payme" : "Click" })}</p>
            {qr && (
              <a href={qr} download={fileName} className={btn.sm}><Download size={15} aria-hidden /> {t("QR-kodni yuklab olish")}</a>
            )}
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-xs text-muted">{link}</span>
            <button type="button" className={btn.sm} onClick={() => link && doCopy("link", link)}>
              {copied === "link" ? <Check size={15} className="text-ok" aria-hidden /> : <Copy size={15} aria-hidden />} {t("Havola")}
            </button>
          </div>
        </>
      ) : (
        <p className="mt-4 rounded-xl bg-warn/10 px-3 py-2.5 text-sm text-warn">
          {t("Click yoki Payme ulanmagan: havola yaratib bo'lmaydi. Sozlamalar → Onlayn to'lov (Click, Payme) bo'limida merchant ID'ni kiriting. Hozircha ota-onaga Kvitansiya ID bilan eslatma yuborishingiz mumkin.")}
        </p>
      )}

      <div className="mt-5">
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{t("Ota-onaga xabar")}</div>
        <pre className="whitespace-pre-wrap rounded-xl [overflow-wrap:anywhere] bg-surface-2 p-3 font-sans text-[13px] leading-relaxed">{message}</pre>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" className={btn.outline} onClick={() => doCopy("msg", message)}>
            {copied === "msg" ? <Check size={16} className="text-ok" aria-hidden /> : <Copy size={16} aria-hidden />} {t("Nusxalash")}
          </button>
          <a href={tg} target="_blank" rel="noreferrer" className={cx(btn.primary, "!bg-[#229ED9]")}><Send size={16} aria-hidden /> Telegram</a>
        </div>
        {parents.length > 0 && (
          <div className="mt-2 flex flex-col gap-1.5">
            {parents.map((p) => (
              <a key={p.id} href={sms(p.phone)} className={cx(btn.sm, "justify-start")}>
                <MessageSquare size={15} aria-hidden /> {t("SMS")}: {p.name} · <span className="tabular">{fmt.phone(p.phone)}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
