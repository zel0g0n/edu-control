"use client";

import { useApp } from "../data/store";
import { translate, type Params } from "./index";

/** Joriy til bo'yicha tarjima funksiyasi (til o'zgarsa komponent qayta chiziladi). */
export function useT(): (key: string, params?: Params) => string {
  const app = useApp();
  const lang = app.lang;
  // O'quv markazida "sinf" o'rniga "guruh"
  const vocab = app.vocab;
  return (key, params) => translate(lang, key, params, vocab);
}
