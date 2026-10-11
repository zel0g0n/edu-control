"use client";

import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, Printer, Send } from "lucide-react";
import { needsStrongPassword, loginOf, STAFF_PASSWORD_MIN, type AppUser } from "@edunazorat/shared";

import { errorText, useToast } from "@/components/providers";
import { copyText } from "@/components/receipt-id";
import { btn, cx, Modal, Pill, useConfirm } from "@/components/ui";
import { useApp, type IssuedCredentials } from "@/lib/data/store";
import type { SessionInfo } from "@/lib/data/transport";
import { fmt } from "@/lib/format";
import { useT } from "@/lib/i18n/react";

/** Kirish manzili: kartada va xabarda ko'rsatiladi. */
function siteUrl(): string {
  return typeof window === "undefined" ? "" : window.location.origin;
}

/**
 * Kirish kartasi: yangi berilgan login va parol. Parol faqat shu oynada ko'rinadi
 * (serverda xesh holida saqlanadi, keyin hech kim ko'ra olmaydi).
 */
export function CredentialCardModal({ issued, onClose }: { issued: IssuedCredentials; onClose: () => void }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const url = siteUrl();
  const text = [
    t("EduNazorat: kirish ma'lumotlari"),
    `${issued.name}`,
    `${t("Sayt")}: ${url}`,
    `${t("Login")}: ${issued.login}`,
    `${t("Parol")}: ${issued.password}`,
    t("Birinchi kirishda parolni o'zgartiring. Parolni hech kimga bermang."),
  ].join("\n");

  const copy = async () => {
    if (await copyText(text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <Modal open onClose={onClose} title={t("Kirish kartasi")}>
      <div id="credential-card" className="rounded-2xl border-2 border-dashed border-line p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">EduNazorat</div>
        <div className="mt-1 text-lg font-bold">{issued.name}</div>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[15px]">
          <dt className="text-muted">{t("Sayt")}</dt><dd className="break-all font-medium">{url.replace(/^https?:\/\//, "")}</dd>
          <dt className="text-muted">{t("Login")}</dt><dd className="select-all font-bold">{issued.login}</dd>
          <dt className="text-muted">{t("Parol")}</dt><dd className="tabular select-all text-xl font-bold tracking-[0.2em]">{issued.password}</dd>
        </dl>
        <p className="mt-4 text-xs text-muted">{t("Birinchi kirishda parolni o'zgartiring. Parolni hech kimga bermang.")}</p>
      </div>
      <p className="mt-3 rounded-xl bg-warn/10 px-3 py-2 text-xs text-warn">
        {t("Parol faqat hozir ko'rinadi. Oyna yopilgach uni hech kim (siz ham) ko'ra olmaydi: unutilsa yangisi beriladi.")}
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <button type="button" className={btn.outline} onClick={copy}>
          {copied ? <Check size={16} className="text-ok" aria-hidden /> : <Copy size={16} aria-hidden />} {t("Nusxa")}
        </button>
        <a className={cx(btn.primary, "!bg-[#229ED9]")} target="_blank" rel="noreferrer"
          href={`https://t.me/share/url?url=${encodeURIComponent(text)}`}><Send size={16} aria-hidden /> Telegram</a>
        <button type="button" className={btn.outline} onClick={() => window.print()}><Printer size={16} aria-hidden /> {t("Chop etish")}</button>
      </div>
    </Modal>
  );
}

/**
 * Bir kishining kirish ma'lumoti: login va "parol berish" tugmasi.
 * Administrator: o'qituvchi/o'quvchi/ota-ona; direktor: administratorlar.
 */
export function CredentialRow({ user, status, onIssued, compact }: {
  user: AppUser;
  status?: { hasPassword: boolean };
  onIssued?: () => void;
  compact?: boolean;
}) {
  const app = useApp();
  const t = useT();
  const { ask, dialog } = useConfirm();
  const [issued, setIssued] = useState<IssuedCredentials | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const has = status?.hasPassword;

  const issue = async () => {
    if (has && !(await ask(t("Yangi parol berilsa, eski parol ishlamay qoladi va {name} barcha qurilmalardan chiqariladi.", { name: user.name }), { ok: t("Yangi parol berish") }))) return;
    setBusy(true);
    setError(null);
    try {
      setIssued(await app.resetPassword(user.id));
      onIssued?.();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cx("flex flex-wrap items-center gap-2", compact ? "" : "justify-between")}>
      <span className="min-w-0 text-sm">
        <span className="text-muted">{t("Login")}: </span>
        <b className="select-all">{loginOf(user) || "—"}</b>
        {status && <> {has ? <Pill tone="ok">{t("parol bor")}</Pill> : <Pill tone="slate">{t("parol berilmagan")}</Pill>}</>}
      </span>
      <button type="button" className={btn.sm} disabled={busy || !loginOf(user)} onClick={issue}>
        <KeyRound size={15} aria-hidden /> {has ? t("Yangi parol") : t("Parol berish")}
      </button>
      {error && <span className="w-full text-xs text-bad">{error}</span>}
      {issued && <CredentialCardModal issued={issued} onClose={() => setIssued(null)} />}
      {dialog}
    </div>
  );
}

/** Bir nechta foydalanuvchining parol holati (kim parol olgan). */
export function useCredentialStatus(ids: string[]) {
  const app = useApp();
  const [status, setStatus] = useState<Record<string, { login: string; hasPassword: boolean }>>({});
  const [tick, setTick] = useState(0);
  const key = ids.join(",");
  useEffect(() => {
    let alive = true;
    if (!key) return;
    app.credentialStatus(key.split(",")).then((s) => { if (alive) setStatus(s); }).catch(() => undefined);
    return () => { alive = false; };
  }, [app, key, tick]);
  return { status, refresh: () => setTick((x) => x + 1) };
}

/** O'z parolini almashtirish. firstLogin: administrator bergan parol bilan birinchi kirish. */
export function PasswordChangeModal({ onClose, firstLogin }: { onClose: () => void; firstLogin?: boolean }) {
  const app = useApp();
  const t = useT();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== again) return setError(t("Yangi parollar bir xil emas"));
    setBusy(true);
    setError(null);
    try {
      await app.changePassword(current, next);
      setDone(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const field = "h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
  return (
    <Modal open onClose={onClose} title={t("Parolni almashtirish")}>
      {done ? (
        <div className="text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-ok/12 text-ok"><Check size={24} aria-hidden /></span>
          <p className="mt-3 font-semibold">{t("Parol almashtirildi")}</p>
          <button type="button" className={cx(btn.primary, "mt-5 w-full")} onClick={onClose}>{t("Yopish")}</button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-3">
          {firstLogin && <p className="rounded-xl bg-primary/8 px-3 py-2.5 text-sm">{t("Siz administrator bergan parol bilan kirdingiz. Xavfsizlik uchun o'zingiz biladigan yangi parol qo'ying.")}</p>}
          <label className="text-[13px] font-semibold text-muted">{t("Joriy parol")}
            <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={cx(field, "mt-1")} />
          </label>
          <label className="text-[13px] font-semibold text-muted">{t("Yangi parol")}
            <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={cx(field, "mt-1")} />
          </label>
          <label className="text-[13px] font-semibold text-muted">{t("Yangi parol (takror)")}
            <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} className={cx(field, "mt-1")} />
          </label>
          <p className="text-xs text-muted">{needsStrongPassword(app.currentUser?.role)
            ? t("Kamida {n} belgi, harf va raqam aralash.", { n: STAFF_PASSWORD_MIN })
            : t("Kamida 6 belgi. 111111 yoki 123456 kabi oson parollar qabul qilinmaydi.")}</p>
          {error && <p role="alert" className="text-sm font-medium text-bad">{error}</p>}
          <div className="mt-1 flex gap-2">
            <button type="button" className={cx(btn.outline, "flex-1")} onClick={onClose}>{firstLogin ? t("Keyinroq") : t("Bekor qilish")}</button>
            <button type="submit" disabled={busy || !current || !next} className={cx(btn.primary, "flex-1")}>{t("Saqlash")}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** Birinchi kirishda (administrator bergan parol) almashtirishni taklif qiladi. */
export function FirstLoginPasswordPrompt() {
  const app = useApp();
  if (!app.mustChangePassword) return null;
  return <PasswordChangeModal firstLogin onClose={() => app.dismissPasswordPrompt()} />;
}

/** Jadvallar uchun ixcham tugma: "Parol berish" (kalit belgisi). */
export function IssuePasswordButton({ user, hasPassword, onIssued }: { user: AppUser; hasPassword?: boolean; onIssued?: () => void }) {
  const app = useApp();
  const t = useT();
  const { ask, dialog } = useConfirm();
  const toast = useToast();
  const [issued, setIssued] = useState<IssuedCredentials | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (hasPassword && !(await ask(t("Yangi parol berilsa, eski parol ishlamay qoladi va {name} barcha qurilmalardan chiqariladi.", { name: user.name }), { ok: t("Yangi parol berish") }))) return;
    setBusy(true);
    try {
      setIssued(await app.resetPassword(user.id));
      onIssued?.();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  const label = hasPassword ? t("Yangi parol") : t("Parol berish");
  return (
    <>
      <button type="button" className={btn.icon} disabled={busy} aria-label={label} title={label} onClick={run}>
        <KeyRound size={17} className={hasPassword ? "text-muted" : "text-primary"} />
      </button>
      {issued && <CredentialCardModal issued={issued} onClose={() => setIssued(null)} />}
      {dialog}
    </>
  );
}

/** Brauzer satridan qisqa nom: "Chrome · Android". */
function deviceName(agent: string): string {
  const browser = /Edg\//.test(agent) ? "Edge" : /OPR\//.test(agent) ? "Opera" : /YaBrowser/.test(agent) ? "Yandex" : /Chrome\//.test(agent) ? "Chrome" : /Firefox\//.test(agent) ? "Firefox" : /Safari\//.test(agent) ? "Safari" : "";
  const os = /Android/.test(agent) ? "Android" : /iPhone|iPad/.test(agent) ? "iOS" : /Windows/.test(agent) ? "Windows" : /Mac OS/.test(agent) ? "macOS" : /Linux/.test(agent) ? "Linux" : "";
  return [browser, os].filter(Boolean).join(" · ") || "—";
}

/** Mening qurilmalarim: qayerdan kirilgan, boshqa qurilmalardan chiqish. */
export function DevicesModal({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const t = useT();
  const [list, setList] = useState<SessionInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    app.sessions().then((l) => { if (alive) setList(l); }).catch((e) => { if (alive) setError(errorText(e)); });
    return () => { alive = false; };
  }, [app, done]);
  const others = (list ?? []).filter((s) => !s.current).length;
  const revoke = async () => {
    try {
      const r = await app.revokeOtherSessions();
      setDone(r.revoked);
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <Modal open onClose={onClose} title={t("Qurilmalar")}>
      <p className="mb-3 text-sm text-muted">{t("Hisobingizga kirilgan qurilmalar. Notanish qurilma bo'lsa, boshqa qurilmalardan chiqing va parolni almashtiring.")}</p>
      {error && <p role="alert" className="mb-2 text-sm text-bad">{error}</p>}
      {!list ? <p className="text-sm text-muted">…</p> : (
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
          {list.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block font-medium">{deviceName(s.agent)}{s.current && <span className="ml-2 text-xs text-ok">{t("shu qurilma")}</span>}</span>
                <span className="block text-xs text-muted">{t("Kirgan: {d}", { d: fmt.dateFull(s.createdAt) })} · {t("oxirgi: {d}", { d: fmt.relative(s.lastSeen, app.now) })}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {done !== null && <p className="mt-3 text-sm text-ok">{t("{n} ta qurilmadan chiqildi", { n: done })}</p>}
      <div className="mt-4 flex gap-2">
        <button type="button" className={cx(btn.outline, "flex-1")} onClick={onClose}>{t("Yopish")}</button>
        <button type="button" className={cx(btn.primary, "flex-1")} disabled={!others} onClick={revoke}>{t("Boshqa qurilmalardan chiqish")}</button>
      </div>
    </Modal>
  );
}
