"use client";

import { useState } from "react";
import { Cctv, Copy, KeyRound } from "lucide-react";
import { NVR_API_VERSION } from "@edunazorat/shared";

import { useRun, useToast } from "@/components/providers";
import { btn, Card, cx, Modal, Pill } from "@/components/ui";
import { useApp } from "@/lib/data/store";
import { fmt } from "@/lib/format";
import { useT } from "@/lib/i18n/react";

const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

/** Kalit brauzerda yaratiladi; serverga faqat SHA-256 xeshi boradi, kalit bir marta ko'rsatiladi. */
async function newKey() {
  const key = `edn_${hex(crypto.getRandomValues(new Uint8Array(24)))}`;
  const keyHash = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)));
  return { key, keyHash, keyPrefix: key.slice(0, 8) };
}

/** NVR (maktab kameralari tizimi) integratsiyasi: ixtiyoriy modul. */
export function NvrBlock() {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const toast = useToast();
  const inst = app.myInstitution!;
  const nvr = inst.settings.nvr ?? { enabled: false };
  const [shown, setShown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `${process.env.NEXT_PUBLIC_API_URL ?? "https://api.maktab.uz"}/integrations/nvr/${NVR_API_VERSION}`;

  const create = async () => {
    setBusy(true);
    try {
      const k = await newKey();
      const ok = await run(() => app.run("nvr.configure", { enabled: true, ...k }), t("Integratsiya kaliti yaratildi"));
      if (ok) setShown(k.key);
    } finally {
      setBusy(false);
    }
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(t("Nusxalandi"), "ok");
    } catch {
      toast(t("Nusxalab bo'lmadi: matnni belgilab nusxalang"));
    }
  };

  return (
    <Card className="p-5">
      <h2 className="mb-1 flex items-center gap-2 text-[15px] font-bold">
        <Cctv size={18} className="text-primary" aria-hidden />{t("NVR integratsiyasi (ixtiyoriy)")}
        <Pill tone={nvr.enabled ? "ok" : "slate"} className="ml-auto">{nvr.enabled ? t("Yoqilgan") : t("O'chirilgan")}</Pill>
      </h2>
      <p className="mb-4 text-sm text-muted">
        {t("Sinf xonalaridagi kameralar (NVR) dars davomatini o'zi oladi va shu yerga yuboradi: o'qituvchi telefoni shart emas. O'qituvchi qo'lda belgilagan davomat ustun turadi. NVR tizimi o'quvchilar ro'yxati va dars jadvalini (xona raqami bilan) shu kalit orqali oladi.")}
      </p>
      {nvr.keyHash ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <KeyRound size={16} className="text-muted" aria-hidden />
          <code className="rounded bg-surface-2 px-1.5 py-0.5">{nvr.keyPrefix}…</code>
          {nvr.keyCreatedAt && <span className="text-muted">{t("yaratilgan: {d}", { d: fmt.dateFull(nvr.keyCreatedAt) })}</span>}
        </div>
      ) : (
        <p className="text-sm text-muted">{t("Kalit hali yaratilmagan.")}</p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={btn.sm} disabled={busy} onClick={create}>
          <KeyRound size={15} aria-hidden /> {nvr.keyHash ? t("Yangi kalit (eskisi bekor bo'ladi)") : t("Kalit yaratish va yoqish")}
        </button>
        {nvr.keyHash && (
          <button type="button" className={btn.sm} onClick={() => run(() => app.run("nvr.configure", { enabled: !nvr.enabled }), nvr.enabled ? t("Integratsiya o'chirildi") : t("Integratsiya yoqildi"))}>
            {nvr.enabled ? t("Vaqtincha o'chirish") : t("Yoqish")}
          </button>
        )}
        {nvr.keyHash && (
          <button type="button" className={cx(btn.sm, "text-bad")} onClick={() => run(() => app.run("nvr.configure", { enabled: false, revoke: true }), t("Kalit bekor qilindi"))}>
            {t("Kalitni bekor qilish")}
          </button>
        )}
      </div>
      {app.mode === "local" && <p className="mt-3 text-xs text-warn">{t("Demo rejim: NVR faqat server rejimida ulanadi (QOLLANMA.md, 3-bo'lim).")}</p>}

      <Modal open={shown !== null} onClose={() => setShown(null)} title={t("Integratsiya kaliti")}
        footer={<button type="button" className={btn.primary} onClick={() => setShown(null)}>{t("Saqladim")}</button>}>
        <p className="text-sm text-bad">{t("Kalit faqat hozir ko'rsatiladi. Uni NVR tizimi sozlamalariga kiriting va boshqalarga bermang.")}</p>
        {shown && (
          <div className="mt-3 flex items-center gap-2">
            <code className="min-w-0 flex-1 rounded-lg bg-surface-2 px-3 py-2 text-xs break-all select-all">{shown}</code>
            <button type="button" className={btn.icon} onClick={() => copy(shown)} aria-label={t("Nusxalash")}><Copy size={18} /></button>
          </div>
        )}
        <p className="mt-4 text-xs font-semibold text-muted">{t("API manzili")}</p>
        <code className="mt-1 block rounded-lg bg-surface-2 px-3 py-2 text-xs break-all select-all">{base}</code>
      </Modal>
    </Card>
  );
}
