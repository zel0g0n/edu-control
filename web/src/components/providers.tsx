"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { CommandError, type AppNotification } from "@edunazorat/shared";

import { store, useStoreVersion } from "@/lib/data/store";
import { translate } from "@/lib/i18n";
import { notificationText } from "@/lib/notif";
import { enablePush, pushState, showSystemNotification } from "@/lib/push";
import { cx } from "./ui";

type ToastKind = "ok" | "error" | "info";
type ToastFn = (text: string, kind?: ToastKind) => void;
const ToastContext = createContext<ToastFn>(() => {});

export function useToast(): ToastFn {
  return useContext(ToastContext);
}

/** Xatoni foydalanuvchi tilidagi matnga aylantirish. */
export function errorText(e: unknown): string {
  if (e instanceof CommandError) return translate(store.lang, e.key, e.params);
  return translate(store.lang, "err.network");
}

/** Buyruqni bajarish: xato bo'lsa xabar ko'rsatadi, muvaffaqiyatda ixtiyoriy xabar. */
export function useRun() {
  const toast = useToast();
  return useCallback(
    async <T,>(fn: () => Promise<T>, ok?: string): Promise<T | undefined> => {
      try {
        const r = await fn();
        if (ok) toast(ok, "ok");
        return r;
      } catch (e) {
        toast(errorText(e), "error");
        return undefined;
      }
    },
    [toast],
  );
}

/**
 * Ma'lumotlar brauzerda yuklanadi (demo) yoki serverdan keladi, shuning uchun
 * ilova faqat brauzerda chiziladi: serverda va birinchi yuklanishda skelet.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const version = useStoreVersion();
  const [toast, setToast] = useState<{ text: string; kind: ToastKind; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback<ToastFn>((text, kind = "info") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ text, kind, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), kind === "error" ? 5000 : 3200);
  }, []);

  // Boshqa foydalanuvchidan kelgan yangi bildirishnoma: tizim xabari yoki ichki xabar.
  useEffect(() => {
    store.onNotify = (items: AppNotification[]) => {
      const shown = items.map(showSystemNotification).some(Boolean);
      if (!shown && items[0]) show(notificationText(store.lang, items[0]), "info");
    };
    return () => {
      store.onNotify = null;
    };
  }, [show]);

  // Ruxsat avval berilgan bo'lsa (backend rejimi): push obunasini yangilab qo'yish.
  const userId = version >= 0 ? store.session.userId : null;
  useEffect(() => {
    if (userId && store.mode === "remote" && pushState() === "granted") void enablePush();
  }, [userId]);

  // <html lang> joriy tilga mos.
  const lang = version >= 0 ? store.lang : "uz";
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  if (version < 0 || store.status === "idle" || store.status === "loading") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4" aria-busy="true">
        <Logo />
        <div className="size-6 animate-spin rounded-full border-[3px] border-primary border-t-transparent" />
      </div>
    );
  }

  if (store.status === "error") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <Logo />
        <p className="max-w-sm text-muted">{translate(store.lang, "err.network")}</p>
        <button type="button" className="h-11 rounded-xl bg-primary px-5 font-semibold text-white" onClick={() => location.reload()}>
          {translate(store.lang, "Qayta urinish")}
        </button>
      </div>
    );
  }

  const Icon = toast?.kind === "error" ? CircleAlert : toast?.kind === "ok" ? CircleCheck : Info;
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4 md:bottom-8">
        {toast && (
          <div key={toast.id} role="status"
            className={cx(
              "pointer-events-auto flex max-w-md items-start gap-2.5 rounded-xl px-4 py-3 text-sm font-medium shadow-xl",
              toast.kind === "error" ? "bg-bad text-white" : "bg-ink text-bg",
            )}>
            <Icon size={18} className="mt-px shrink-0" aria-hidden />
            <span>{toast.text}</span>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function Logo({ compact, light }: { compact?: boolean; light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="relative flex size-9 items-center justify-center overflow-hidden rounded-[10px] bg-primary text-white dark:text-nav" aria-hidden>
        {/* Daftar varag'i: katak va qizil hoshiya */}
        <svg viewBox="0 0 36 36" className="absolute inset-0 size-full">
          <path d="M0 12H36M0 24H36M12 0V36M24 0V36" stroke="currentColor" strokeOpacity=".16" />
          <path d="M8 0V36" stroke="var(--margin)" strokeWidth="2" />
        </svg>
        <span className="font-display relative text-[15px] font-bold">5</span>
      </span>
      {!compact && <span className={cx("font-display text-[17px] font-bold tracking-tight", light ? "text-white" : "")}>EduNazorat</span>}
    </span>
  );
}
