"use client";

import { Moon, Sun } from "lucide-react";

import { useT } from "@/lib/i18n/react";
import { setThemePref, toggleTheme, useTheme, type ThemePref } from "@/lib/theme";
import { btn, cx, Segmented } from "./ui";

/** Bir bosishda yorug' ↔ qorong'i. `nav`: kompyuterdagi to'q chap panel uchun. */
export function ThemeToggle({ nav, className }: { nav?: boolean; className?: string }) {
  const t = useT();
  const { theme } = useTheme();
  const dark = theme === "dark";
  const label = dark ? t("Yorug' rejimga o'tish") : t("Qorong'i rejimga o'tish");
  return (
    <button type="button" onClick={toggleTheme} aria-label={label} title={label}
      className={cx(nav ? "flex size-9 shrink-0 items-center justify-center rounded-lg text-nav-ink hover:bg-nav-2 hover:text-nav-active" : btn.icon, className)}>
      {dark ? <Sun size={20} aria-hidden /> : <Moon size={20} aria-hidden />}
    </button>
  );
}

/** Profil oynasi uchun: Avtomatik (telefon sozlamasi) / Yorug' / Qorong'i. */
export function ThemeSetting() {
  const t = useT();
  const { pref } = useTheme();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-sm font-semibold">{t("Ko'rinish")}</span>
      <Segmented<ThemePref> size="sm" value={pref} onChange={setThemePref}
        options={[{ value: "system", label: t("Avtomatik") }, { value: "light", label: t("Yorug'") }, { value: "dark", label: t("Qorong'i") }]} />
    </div>
  );
}
