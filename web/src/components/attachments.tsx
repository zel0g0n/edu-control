"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, ImageIcon, Paperclip, X } from "lucide-react";
import type { Attachment } from "@edunazorat/shared";

import { useApp } from "@/lib/data/store";
import { fmt } from "@/lib/format";
import { useT } from "@/lib/i18n/react";
import { useRun } from "./providers";
import { btn, cx, Modal } from "./ui";

const MAX_FILES = 5;

/** Fayl biriktirish: rasm, PDF, Word va h.k. (5 tagacha). */
export function AttachmentPicker({ value, onChange }: { value: Attachment[]; onChange: (v: Attachment[]) => void }) {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const next = [...value];
    for (const f of [...files].slice(0, MAX_FILES - value.length)) {
      const a = await run(() => app.upload(f));
      if (a) next.push(a);
    }
    onChange(next);
    setBusy(false);
    if (input.current) input.current.value = "";
  };

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {value.map((a) => (
            <li key={a.id} className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2">
              <FileIcon type={a.type} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{a.name}</span>
                <span className="block text-xs text-muted">{fmt.fileSize(a.size)}</span>
              </span>
              <button type="button" className={btn.icon} aria-label={t("Olib tashlash")} onClick={() => onChange(value.filter((x) => x.id !== a.id))}>
                <X size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {value.length < MAX_FILES && (
        <>
          <input ref={input} type="file" multiple hidden accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.sb3"
            onChange={(e) => add(e.target.files)} />
          <button type="button" className={cx(btn.sm, "self-start")} disabled={busy} onClick={() => input.current?.click()}>
            <Paperclip size={16} aria-hidden /> {busy ? t("Yuklanmoqda…") : t("Fayl biriktirish")}
          </button>
          <span className="text-xs text-muted">
            {app.mode === "local" ? t("Demo rejimda: 5 tagacha fayl, har biri 400 KB gacha (rasmlar avtomatik kichraytiriladi)") : t("5 tagacha fayl, har biri 2 MB gacha")}
          </span>
        </>
      )}
    </div>
  );
}

function FileIcon({ type }: { type: string }) {
  const Icon = type.startsWith("image/") ? ImageIcon : FileText;
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-ink">
      <Icon size={18} aria-hidden />
    </span>
  );
}

/** Biriktirilgan fayllar: rasmlar kichik ko'rinishda, boshqalari yuklab olish uchun. */
/**
 * Server fayllari faqat imzolangan qisqa muddatli havola bilan ochiladi: havola shu foydalanuvchiga
 * bog'langan va 15 daqiqada eskiradi (havola tarqalib ketsa ham ochilmaydi).
 */
function useSignedUrls(items: Attachment[]): Record<string, string> {
  const app = useApp();
  const key = items.map((a) => a.url.length > 200 ? a.id : a.url).join("|");
  const [state, setState] = useState<{ key: string; map: Record<string, string> }>({ key: "", map: {} });
  useEffect(() => {
    let alive = true;
    const urls = items.map((a) => a.url).filter((u) => /^https?:/.test(u));
    if (!urls.length) return;
    app.signFileUrls(urls).then((map) => { if (alive) setState({ key, map }); }).catch(() => undefined);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app, key]);
  return state.key === key ? state.map : {};
}

export function AttachmentList({ items }: { items: Attachment[] }) {
  const t = useT();
  const [preview, setPreview] = useState<Attachment | null>(null);
  const signed = useSignedUrls(items);
  // data: (demo) havolalar o'zi; server fayllari imzolangani tayyor bo'lguncha bo'sh
  const src = (a: Attachment) => (a.url.startsWith("data:") ? a.url : signed[a.url]);
  if (items.length === 0) return null;
  const images = items.filter((a) => a.type.startsWith("image/"));
  const files = items.filter((a) => !a.type.startsWith("image/"));
  return (
    <div className="flex flex-col gap-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((a) => (
            <button key={a.id} type="button" onClick={() => setPreview(a)} className="overflow-hidden rounded-xl border border-line" aria-label={a.name}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {src(a) ? <img src={src(a)} alt={a.name} className="size-20 object-cover" /> : <span className="block size-20 animate-pulse bg-surface-2" />}
            </button>
          ))}
        </div>
      )}
      {files.map((a) => (
        <a key={a.id} href={src(a) ?? "#"} download={a.name} target="_blank" rel="noreferrer" aria-disabled={!src(a)}
          className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2 hover:bg-surface-2">
          <FileIcon type={a.type} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{a.name}</span>
            <span className="block text-xs text-muted">{fmt.fileSize(a.size)} · {t("Yuklab olish")}</span>
          </span>
        </a>
      ))}
      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.name} wide>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {preview && src(preview) && <img src={src(preview)} alt={preview.name} className="mx-auto max-h-[70dvh] rounded-xl" />}
        {preview && <a href={src(preview) ?? "#"} download={preview.name} className={cx(btn.outline, "mt-3 w-full")}>{t("Yuklab olish")}</a>}
      </Modal>
    </div>
  );
}
