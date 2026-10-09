"use client";

import { useSyncExternalStore } from "react";

import { THEME_COLORS as COLORS, THEME_KEY } from "./theme-boot";

export { THEME_KEY };

/** Foydalanuvchi tanlovi: tizimga ergashish, yorug' yoki qorong'i. */
export type ThemePref = "system" | "light" | "dark";
export type Theme = "light" | "dark";

const listeners = new Set<() => void>();
let pref: ThemePref = "system";
let started = false;

function systemDark(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

function resolve(p: ThemePref): Theme {
  return p === "system" ? (systemDark() ? "dark" : "light") : p;
}

function apply() {
  const theme = resolve(pref);
  const root = document.documentElement;
  root.dataset.theme = theme;
  // Telefon status paneli rangi ham tanlangan mavzuga mos bo'lsin
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    m.removeAttribute("media");
    m.content = COLORS[theme];
  });
  listeners.forEach((l) => l());
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark") pref = v;
  } catch {
    /* saqlash imkoni yo'q: tizim mavzusi */
  }
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    if (pref === "system") apply();
  });
  // Boshqa oynada o'zgartirilsa
  window.addEventListener("storage", (e) => {
    if (e.key !== THEME_KEY) return;
    pref = e.newValue === "light" || e.newValue === "dark" ? e.newValue : "system";
    apply();
  });
  apply();
}

export function setThemePref(next: ThemePref) {
  start();
  pref = next;
  try {
    if (next === "system") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, next);
  } catch {
    /* faqat shu sessiya uchun */
  }
  apply();
}

/** Yorug' ↔ qorong'i (hozir ko'rinayotganiga teskari). */
export function toggleTheme() {
  setThemePref(resolve(pref) === "dark" ? "light" : "dark");
}

function subscribe(cb: () => void) {
  start();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const snapshot = () => `${pref}:${resolve(pref)}`;

export function useTheme(): { pref: ThemePref; theme: Theme } {
  const s = useSyncExternalStore(subscribe, snapshot, () => "system:light");
  const [p, t] = s.split(":") as [ThemePref, Theme];
  return { pref: p, theme: t };
}
