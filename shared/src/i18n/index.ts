import { RU } from "./ru";
import { UZ } from "./uz";

export type Lang = "uz" | "ru";
export type Params = Record<string, string | number | undefined>;
export { RU, UZ };

function lookup(lang: Lang, key: string): string | undefined {
  if (lang === "ru") return RU[key] ?? UZ[key];
  return UZ[key];
}

/**
 * Tarjima. Kalit o'zbekcha matnning o'zi yoki nuqtali kalit.
 * Parametr qiymati ham kalit bo'lsa (masalan "grade.type.control"), u ham tarjima qilinadi.
 */
export function translate(lang: Lang, key: string, params?: Params): string {
  const template = lookup(lang, key) ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = params[k];
    if (v === undefined) return "";
    if (typeof v === "string" && /^[a-z]+(\.[a-zA-Z]+)+$/.test(v)) return lookup(lang, v) ?? v;
    return String(v);
  });
}
