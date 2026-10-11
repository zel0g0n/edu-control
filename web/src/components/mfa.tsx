"use client";

import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, LogOut, ShieldCheck, Smartphone } from "lucide-react";
import QRCode from "qrcode";

import { useApp } from "@/lib/data/store";
import { useT } from "@/lib/i18n/react";
import { errorText, Logo, useToast } from "./providers";
import { copyText } from "./receipt-id";
import { btn, cx, inputCls, Modal, Pill } from "./ui";

/** 6 xonali ilova kodi yoki zaxira kod (xxxx-xxxx). */
export function CodeInput({ value, onChange, allowBackup, autoFocus }: { value: string; onChange: (v: string) => void; allowBackup?: boolean; autoFocus?: boolean }) {
  const t = useT();
  return (
    <input inputMode={allowBackup ? "text" : "numeric"} autoComplete="one-time-code" autoFocus={autoFocus} aria-label={t("Kod")}
      value={value} maxLength={allowBackup ? 12 : 6} placeholder={allowBackup ? "123456" : "······"}
      onChange={(e) => onChange(allowBackup ? e.target.value.slice(0, 12) : e.target.value.replace(/\D/g, "").slice(0, 6))}
      className={cx(inputCls, "tabular h-14 text-center text-2xl font-bold tracking-[0.3em]")} />
  );
}

/** Kirish sahifasi: parol to'g'ri, endi ilova kodi. */
export function MfaLoginStep({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const app = useApp();
  const t = useT();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    try {
      await app.completeMfa(code);
      onDone();
    } catch (err) {
      setError(errorText(err));
      setCode("");
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} noValidate>
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary"><Smartphone size={24} aria-hidden /></span>
      <h2 className="mt-4 text-2xl font-bold tracking-tight">{t("Ikki bosqichli kirish")}</h2>
      <p className="mt-1.5 text-[15px] text-muted">{t("Telefoningizdagi autentifikator ilovasidagi 6 xonali kodni kiriting. Telefon yo'q bo'lsa, zaxira kodlardan birini kiriting.")}</p>
      <div className="mt-6"><CodeInput value={code} onChange={(v) => { setCode(v); setError(null); }} allowBackup autoFocus /></div>
      {error && <p role="alert" className="mt-2 text-sm font-medium text-bad">{error}</p>}
      <button type="submit" disabled={busy || code.trim().length < 6} className={cx(btn.primary, "mt-5 h-12 w-full text-[15px]")}>{t("Tasdiqlash")}</button>
      <button type="button" className={cx(btn.ghost, "mt-3 w-full")} onClick={onBack}>{t("Orqaga")}</button>
    </form>
  );
}

/** Zaxira kodlar: faqat bir marta ko'rsatiladi. */
function BackupCodes({ codes, onDone, doneLabel }: { codes: string[]; onDone: () => void; doneLabel: string }) {
  const t = useT();
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">{t("Zaxira kodlar: telefon yo'qolsa, har biri bilan bir marta kirish mumkin. Ularni qog'ozga yozib, xavfsiz joyda saqlang. Bu kodlar boshqa ko'rsatilmaydi.")}</p>
      <div className="tabular grid grid-cols-2 gap-1.5 rounded-xl border border-line bg-surface-2 p-3 font-mono text-[15px]" data-testid="backup-codes">
        {codes.map((c) => <span key={c}>{c}</span>)}
      </div>
      <button type="button" className={btn.outline} onClick={async () => { setCopied(await copyText(codes.join("\n"))); }}>
        {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />} {copied ? t("Nusxalandi") : t("Nusxalash")}
      </button>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="size-4 accent-[var(--color-primary)]" />
        {t("Zaxira kodlarni saqlab qo'ydim")}
      </label>
      <button type="button" className={btn.primary} disabled={!saved} onClick={onDone}>{doneLabel}</button>
    </div>
  );
}

/** 2FA'ni yoqish: QR → ilova kodi → zaxira kodlar. */
export function MfaEnroll({ onDone, doneLabel }: { onDone: () => void; doneLabel: string }) {
  const app = useApp();
  const t = useT();
  const [setup, setSetup] = useState<{ secret: string; url: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await app.mfaSetup();
      const qr = await QRCode.toDataURL(s.url, { margin: 1, width: 360, errorCorrectionLevel: "M" });
      setSetup({ ...s, qr });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const confirm = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setCodes((await app.mfaEnable(code)).backupCodes);
    } catch (err) {
      setError(errorText(err));
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  if (codes) return <BackupCodes codes={codes} onDone={onDone} doneLabel={doneLabel} />;
  if (!setup) {
    return (
      <div className="flex flex-col gap-3">
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
          <li>{t("Telefoningizga autentifikator ilovasini o'rnating: Google Authenticator, Microsoft Authenticator yoki boshqasi.")}</li>
          <li>{t("Ilovada QR kodni skanerlang.")}</li>
          <li>{t("Ilova ko'rsatgan 6 xonali kodni kiriting.")}</li>
        </ol>
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        <button type="button" className={btn.primary} disabled={busy} onClick={start}><KeyRound size={16} aria-hidden /> {t("Boshlash")}</button>
      </div>
    );
  }
  return (
    <form onSubmit={confirm} noValidate className="flex flex-col items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={setup.qr} alt={t("QR kod")} className="size-48 rounded-xl border border-line bg-white p-2" />
      <details className="w-full text-sm">
        <summary className="cursor-pointer text-muted">{t("QR skanerlab bo'lmasa: kalitni qo'lda kiriting")}</summary>
        <code className="mt-2 block rounded-lg bg-surface-2 p-2 text-center font-mono text-[13px] break-all" data-testid="mfa-secret">{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
      </details>
      <div className="w-full"><CodeInput value={code} onChange={(v) => { setCode(v); setError(null); }} autoFocus /></div>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      <button type="submit" className={cx(btn.primary, "w-full")} disabled={busy || code.length !== 6}>{t("Tasdiqlash")}</button>
    </form>
  );
}

/** Rahbariyat a'zosi 2FA'ni yoqmaguncha ilova o'rniga shu ekran. */
export function MfaSetupScreen() {
  const app = useApp();
  const t = useT();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">
        <Logo />
        <div className="mt-8 rounded-2xl border border-line bg-surface p-6">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary"><ShieldCheck size={24} aria-hidden /></span>
          <h1 className="mt-4 text-xl font-bold">{t("Ikki bosqichli kirishni yoqing")}</h1>
          <p className="mt-1.5 mb-5 text-sm text-muted">{t("Siz butun muassasa ma'lumotlarini ko'ra olasiz. Hisobingizni himoya qilish uchun parolga qo'shimcha telefoningizdagi kod so'raladi. Bu majburiy.")}</p>
          <MfaEnroll doneLabel={t("Davom etish")} onDone={() => void app.finishMfaSetup()} />
        </div>
        <button type="button" className={cx(btn.ghost, "mt-4 w-full")} onClick={() => void app.signOut()}><LogOut size={16} aria-hidden /> {t("Chiqish")}</button>
      </div>
    </div>
  );
}

/** Profil: 2FA holati, yoqish, zaxira kodlarni yangilash, o'chirish. */
export function MfaModal({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const t = useT();
  const toast = useToast();
  const [status, setStatus] = useState<{ enabled: boolean; required: boolean } | null>(null);
  const [mode, setMode] = useState<"view" | "enroll" | "backup" | "disable">("view");
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    app.mfaStatus().then((s) => { if (alive) setStatus(s); }).catch((e) => { if (alive) setError(errorText(e)); });
    return () => { alive = false; };
  }, [app, tick]);

  const act = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (mode === "backup") setCodes((await app.mfaBackupCodes(code)).backupCodes);
      else {
        await app.mfaDisable(code);
        toast(t("Ikki bosqichli kirish o'chirildi"), "ok");
        setMode("view");
        setTick(tick + 1);
      }
    } catch (err) {
      setError(errorText(err));
    }
    setCode("");
  };

  return (
    <Modal open onClose={onClose} title={t("Ikki bosqichli kirish")}>
      {!status ? <p className="text-sm text-muted">{error ?? "…"}</p>
        : codes ? <BackupCodes codes={codes} doneLabel={t("Yopish")} onDone={onClose} />
          : mode === "enroll" ? <MfaEnroll doneLabel={t("Tayyor")} onDone={() => { setMode("view"); setTick(tick + 1); }} />
            : mode === "view" ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Pill tone={status.enabled ? "ok" : "slate"} icon={ShieldCheck}>{status.enabled ? t("Yoqilgan") : t("O'chiq")}</Pill>
                  {status.required && <span className="text-xs text-muted">{t("rahbariyat uchun majburiy")}</span>}
                </div>
                <p className="text-sm text-muted">{t("Kirishda paroldan keyin telefoningizdagi ilova kodi so'raladi: parol o'g'irlansa ham hisobingizga kira olmaydi.")}</p>
                {!status.enabled && <button type="button" className={btn.primary} onClick={() => setMode("enroll")}>{t("Yoqish")}</button>}
                {status.enabled && <button type="button" className={btn.outline} onClick={() => setMode("backup")}>{t("Yangi zaxira kodlar")}</button>}
                {status.enabled && !status.required && <button type="button" className={btn.outline} onClick={() => setMode("disable")}>{t("O'chirish")}</button>}
              </div>
            ) : (
              <form onSubmit={act} noValidate className="flex flex-col gap-3">
                <p className="text-sm">{t("Tasdiqlash uchun ilovadagi joriy kodni kiriting.")}</p>
                <CodeInput value={code} onChange={setCode} autoFocus />
                {error && <p role="alert" className="text-sm text-bad">{error}</p>}
                <div className="flex gap-2">
                  <button type="button" className={cx(btn.outline, "flex-1")} onClick={() => { setMode("view"); setError(null); }}>{t("Orqaga")}</button>
                  <button type="submit" className={cx(mode === "disable" ? btn.danger : btn.primary, "flex-1")} disabled={code.length !== 6}>
                    {mode === "disable" ? t("O'chirish") : t("Yangi kodlar")}
                  </button>
                </div>
              </form>
            )}
    </Modal>
  );
}
