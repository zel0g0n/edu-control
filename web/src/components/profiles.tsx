"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, BookOpen, ChevronRight, GraduationCap, HeartHandshake, LayoutDashboard, LogIn, LogOut, ShieldCheck } from "lucide-react";
import type { UserRole } from "@edunazorat/shared";

import { useApp, type ProfileInfo } from "@/lib/data/store";
import { useT } from "@/lib/i18n/react";
import { errorText, Logo } from "./providers";
import { destinationFor, homeFor } from "./shell";
import { btn, cx } from "./ui";

const ROLE_ICON: Record<UserRole, LucideIcon> = {
  parent: HeartHandshake, teacher: BookOpen, student: GraduationCap, admin: ShieldCheck, director: LayoutDashboard, superAdmin: ShieldCheck,
};

/** Profil tugmasi: rol belgisi, rol nomi, muassasa. */
function ProfileRow({ p, busy, onPick, hint }: { p: ProfileInfo; busy: boolean; onPick: () => void; hint?: string }) {
  const t = useT();
  const Icon = ROLE_ICON[p.role];
  return (
    <button type="button" disabled={busy} onClick={onPick}
      className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-left transition hover:border-primary hover:bg-primary-soft/40 disabled:opacity-60">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary"><Icon size={20} aria-hidden /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{hint ?? t(`role.${p.role}`)}</span>
        <span className="block truncate text-[13px] text-muted">{p.name}{p.institution ? ` · ${p.institution}` : ""}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden />
    </button>
  );
}

function useSwitch() {
  const app = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async (p: ProfileInfo, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      const u = await app.switchProfile(p.id);
      after?.();
      router.replace(destinationFor(u.role));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, go };
}

/** Kirishdan keyin: bir telefonda bir nechta profil (o'qituvchi va ota-ona) — qaysi biri bilan davom etish. */
export function ProfileChooser() {
  const app = useApp();
  const t = useT();
  const { busy, error, go } = useSwitch();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">
        <Logo />
        <h1 className="mt-8 text-xl font-bold">{t("Qaysi profil bilan kirasiz?")}</h1>
        <p className="mt-1.5 mb-5 text-sm text-muted">{t("Bu raqamga bir nechta profil bog'langan. Keyin profil menyusidan istalgan vaqtda almashtirishingiz mumkin.")}</p>
        <div className="flex flex-col gap-2">
          {app.profiles.map((p) => <ProfileRow key={p.id} p={p} busy={busy} onPick={() => void go(p)} />)}
        </div>
        {error && <p role="alert" className="mt-3 text-sm font-medium text-bad">{error}</p>}
        <button type="button" className={cx(btn.ghost, "mt-4 w-full")} onClick={() => void app.signOut()}><LogOut size={16} aria-hidden /> {t("Chiqish")}</button>
      </div>
    </div>
  );
}

/** Profil oynasida: boshqa profillarga o'tish. */
export function ProfileSwitchList({ onDone }: { onDone: () => void }) {
  const app = useApp();
  const t = useT();
  const { busy, error, go } = useSwitch();
  const others = app.profiles.filter((p) => !p.current);
  if (!others.length) return null;
  return (
    <div className="mt-5">
      <div className="mb-2 text-sm font-semibold">{t("Boshqa profillarim")}</div>
      <div className="flex flex-col gap-2">
        {others.map((p) => (
          <ProfileRow key={p.id} p={p} busy={busy} onPick={() => void go(p, onDone)}
            hint={t("{role} profiliga o'tish", { role: t(`role.${p.role}`) })} />
        ))}
      </div>
      {error && <p role="alert" className="mt-2 text-sm font-medium text-bad">{error}</p>}
    </div>
  );
}

/**
 * Boshqa profilning sahifasi ochildi (masalan, ota-ona bildirishnomasi o'qituvchi profilida bosildi):
 * yo'naltirish o'rniga shu profilga o'tishni taklif qiladi.
 */
export function SwitchForPage({ profile }: { profile: ProfileInfo }) {
  const app = useApp();
  const t = useT();
  const router = useRouter();
  const { busy, error, go } = useSwitch();
  const me = app.currentUser;
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">
        <h1 className="text-xl font-bold">{t("Bu sahifa boshqa profilingizda")}</h1>
        <p className="mt-1.5 mb-5 text-sm text-muted">{t("Davom etish uchun shu profilga o'ting.")}</p>
        <ProfileRow p={profile} busy={busy} onPick={() => void go(profile)} hint={t("{role} profiliga o'tish", { role: t(`role.${profile.role}`) })} />
        {error && <p role="alert" className="mt-3 text-sm font-medium text-bad">{error}</p>}
        {me && (
          <button type="button" className={cx(btn.ghost, "mt-4 w-full")} onClick={() => router.replace(homeFor(me.role))}>
            {t("{role} profilida qolish", { role: t(`role.${me.role}`) })}
          </button>
        )}
      </div>
    </div>
  );
}

/** Bo'lim nomi (sahifa kim uchun). */
const AREA_LABEL: Record<UserRole, string> = {
  superAdmin: "super admin", director: "direktor va administrator", admin: "direktor va administrator",
  teacher: "o'qituvchi", parent: "ota-ona", student: "o'quvchi",
};

/**
 * Boshqa rolning sahifasi ochildi (masalan, super admin sifatida kirib /director ochildi).
 * Bitta brauzerda bir vaqtda bitta hisob: chiqib, boshqa hisob bilan kirish taklif qilinadi.
 */
export function WrongAccount({ area }: { area: UserRole }) {
  const app = useApp();
  const t = useT();
  const router = useRouter();
  const me = app.currentUser;
  if (!me) return null;
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">
        <Logo />
        <h1 className="mt-8 text-xl font-bold">{t("Bu sahifa {who} uchun", { who: t(AREA_LABEL[area]) })}</h1>
        <p className="mt-1.5 text-sm text-muted">
          {t("Siz hozir {name} ({role}) sifatida kirgansiz. Bitta brauzerda bir vaqtda bitta hisob ochiq turadi.", { name: me.name, role: t(`role.${me.role}`) })}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          {/* Chiqilgach sahifa o'zi kirishga yuboradi (?next= bilan: kirgach shu sahifaga qaytiladi) */}
          <button type="button" className={btn.primary} onClick={() => void app.signOut()}>
            <LogIn size={18} aria-hidden /> {t("Chiqib, boshqa hisob bilan kirish")}
          </button>
          <button type="button" className={btn.outline} onClick={() => router.replace(homeFor(me.role))}>
            <ArrowLeft size={18} aria-hidden /> {t("O'z sahifamga qaytish")}
          </button>
        </div>
        <p className="mt-5 text-xs text-muted">{t("Ikki hisobni yonma-yon ochish uchun ikkinchisini boshqa brauzerda yoki yashirin (inkognito) oynada oching.")}</p>
      </div>
    </div>
  );
}
