"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, ChevronLeft, MessagesSquare, ScanFace, Star, Wallet } from "lucide-react";
import { DEMO_ACCOUNTS } from "@edunazorat/shared";

import { errorText, Logo } from "@/components/providers";
import { homeFor } from "@/components/shell";
import { btn, cx, inputCls, Segmented } from "@/components/ui";
import { useApp } from "@/lib/data/store";
import { fmt } from "@/lib/format";
import { useT } from "@/lib/i18n/react";

export default function LoginPage() {
  const app = useApp();
  const t = useT();
  const router = useRouter();
  const [digits, setDigits] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(60);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const phone = `998${digits}`;
  // Demo hisoblar ro'yxati: brauzer demo rejimida yoki server demo ma'lumot bilan ishga tushirilganda.
  const showDemo = app.mode === "local" || process.env.NEXT_PUBLIC_SHOW_DEMO === "1";

  useEffect(() => {
    if (app.currentUser) router.replace(homeFor(app.currentUser.role));
  }, [app.currentUser, router]);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  const startTimer = () => {
    if (timer.current) clearInterval(timer.current);
    setLeft(60);
    timer.current = setInterval(() => {
      setLeft((v) => {
        if (v <= 1 && timer.current) clearInterval(timer.current);
        return Math.max(0, v - 1);
      });
    }, 1000);
  };

  const requestCode = async (e?: React.FormEvent, number = phone) => {
    e?.preventDefault();
    if (number.length !== 12) return setError(t("Raqamni to'liq kiriting (9 ta raqam)"));
    setBusy(true);
    try {
      const r = await app.requestCode(number);
      setDevCode(r.devCode);
      setError(null);
      setCode("");
      setStep("otp");
      startTimer();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value = code, number = phone) => {
    setBusy(true);
    try {
      const user = await app.signIn(number, value);
      router.replace(homeFor(user.role));
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  const quick = async (p: string) => {
    setDigits(p.slice(3));
    setBusy(true);
    try {
      const r = await app.requestCode(p);
      if (!r.devCode) {
        // Haqiqiy SMS rejimi: kodni foydalanuvchi kiritadi.
        setDevCode(undefined);
        setStep("otp");
        startTimer();
        setBusy(false);
        return;
      }
      const user = await app.signIn(p, r.devCode);
      router.replace(homeFor(user.role));
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 min-h-dvh md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Kompyuter: chap tomonda tanishtiruv */}
      <aside className="relative hidden overflow-hidden bg-nav px-12 py-12 text-nav-ink md:flex md:flex-col">
        <svg className="pointer-events-none absolute inset-0 size-full opacity-[0.07]" aria-hidden>
          <defs>
            <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
              <path d="M28 0H0V28" fill="none" stroke="white" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
        <div className="absolute top-0 bottom-0 left-[72px] w-px bg-margin/60" aria-hidden />
        <div className="relative pl-10"><Logo light /></div>
        <div className="relative mt-auto max-w-md pl-10">
          <h1 className="font-display text-[34px] leading-[1.15] font-bold text-white">{t("Farzandingiz o'qishi — kaftingizda")}</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-nav-ink">
            {t("Baholar, dars bo'yicha davomat, uy vazifalari va to'lovlar bitta joyda. O'qituvchi davomatni telefon kamerasi orqali bir necha soniyada oladi.")}
          </p>
          <ul className="mt-8 grid grid-cols-2 gap-3 text-sm">
            {[
              [Star, t("Elektron jurnal")],
              [CalendarCheck, t("Dars bo'yicha davomat")],
              [ScanFace, t("Yuz orqali yo'qlama")],
              [Wallet, t("Click va Payme orqali to'lov")],
              [MessagesSquare, t("O'qituvchi bilan yozishma")],
            ].map(([Icon, label]) => {
              const I = Icon as typeof Star;
              return (
                <li key={label as string} className="flex items-center gap-2.5">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-white/8 text-white"><I size={16} aria-hidden /></span>
                  {label as string}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="relative mt-10 pl-10 text-xs text-nav-ink/60">© 2026 EduNazorat</div>
      </aside>

      <main className="flex flex-col px-5 pt-[max(env(safe-area-inset-top),20px)] pb-8 md:justify-center md:px-16">
        <div className="flex items-center justify-between md:absolute md:top-6 md:right-8">
          <span className="md:hidden"><Logo /></span>
          <Segmented size="sm" value={app.lang} onChange={(l) => app.setLang(l)} options={[{ value: "uz", label: "UZ" }, { value: "ru", label: "RU" }]} />
        </div>

        <div className="mx-auto mt-10 w-full max-w-sm md:mt-0">
          {step === "phone" ? (
            <form onSubmit={requestCode} noValidate>
              <h2 className="text-2xl font-bold tracking-tight">{t("Kirish")}</h2>
              <p className="mt-1.5 text-[15px] text-muted">{t("Muassasa ro'yxatga olgan telefon raqamingizni kiriting")}</p>
              <label className="mt-6 block text-[13px] font-semibold text-muted" htmlFor="phone">{t("Telefon raqam")}</label>
              <div className="mt-1.5 flex">
                <span className="flex h-12 items-center rounded-l-xl border border-r-0 border-line bg-surface-2 px-3.5 text-[15px] font-semibold">+998</span>
                <input id="phone" inputMode="numeric" autoComplete="tel-national" autoFocus placeholder="90 123 45 67"
                  value={fmt.phoneLocal(digits)}
                  onChange={(e) => {
                    setDigits(e.target.value.replace(/\D/g, "").slice(0, 9));
                    setError(null);
                  }}
                  className={cx(inputCls, "tabular h-12 rounded-l-none text-[17px] tracking-wide")} />
              </div>
              {error && <p role="alert" className="mt-2 text-sm font-medium text-bad">{error}</p>}
              <button type="submit" disabled={busy} className={cx(btn.primary, "mt-5 h-12 w-full text-[15px]")}>{t("Kod olish")}</button>

              {showDemo && <div className="mt-10">
                <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-muted">
                  <span className="h-px flex-1 bg-line" />{app.mode === "local" ? t("Demo hisoblar (kod 1111)") : t("Demo hisoblar")}<span className="h-px flex-1 bg-line" />
                </div>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {DEMO_ACCOUNTS.map((a) => (
                    <button key={a.phone} type="button" disabled={busy} onClick={() => quick(a.phone)}
                      className="flex flex-col items-start rounded-xl border border-line bg-surface px-3 py-2 text-left transition hover:border-primary/60 disabled:opacity-50">
                      <span className="text-[13px] font-semibold">{t(a.label)}</span>
                      <span className="tabular text-xs text-muted">{fmt.phone(a.phone)}</span>
                    </button>
                  ))}
                </div>
              </div>}
            </form>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); void verify(); }} noValidate>
              <button type="button" className={cx(btn.ghost, "-ml-2.5 mb-4")} onClick={() => { setStep("phone"); setError(null); }}>
                <ChevronLeft size={18} aria-hidden /> {t("Raqamni o'zgartirish")}
              </button>
              <h2 className="text-2xl font-bold tracking-tight">{t("SMS kod")}</h2>
              <p className="mt-1.5 text-[15px] text-muted">{t("{phone} raqamiga 4 xonali kod yuborildi", { phone: fmt.phone(phone) })}</p>
              {devCode && <p className="mt-3 rounded-lg bg-warn/12 px-3 py-2 text-sm text-warn">{t("Demo rejim: SMS yuborilmaydi, kod {code}", { code: devCode })}</p>}
              <label className="sr-only" htmlFor="otp">{t("SMS kod")}</label>
              <input id="otp" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={4} value={code}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                  setCode(v);
                  setError(null);
                  if (v.length === 4) void verify(v);
                }}
                className={cx(inputCls, "tabular mt-6 h-14 text-center text-2xl font-bold tracking-[0.6em]")} placeholder="····" />
              {error && <p role="alert" className="mt-2 text-sm font-medium text-bad">{error}</p>}
              <button type="submit" disabled={busy || code.length !== 4} className={cx(btn.primary, "mt-5 h-12 w-full text-[15px]")}>{t("Kirish")}</button>
              <button type="button" disabled={left > 0 || busy} className={cx(btn.ghost, "mt-3 w-full")} onClick={() => requestCode()}>
                {left > 0 ? t("Qayta yuborish: {s} s", { s: left }) : t("Kodni qayta yuborish")}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
