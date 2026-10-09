"use client";

import { useApp } from "../data/store";
import { translate, type Params } from "./index";

/** Joriy til bo'yicha tarjima funksiyasi (til o'zgarsa komponent qayta chiziladi). */
export function useT(): (key: string, params?: Params) => string {
  const app = useApp();
  const lang = app.lang;
  return (key, params) => translate(lang, key, params);
}
