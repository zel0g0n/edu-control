import { RU_CENTER, UZ_CENTER, uzCenterWords } from "./center";
import { UZ } from "./uz";

export type Lang = "uz" | "ru";
export type Params = Record<string, string | number | undefined>;
/** Atamalar: maktab (sinf) yoki o'quv markazi (guruh). */
export type Vocab = "school" | "center";
export { UZ };
export { RU } from "./ru";

/**
 * Ruscha lug'at (~90 KB) ro'yxatdan o'tkaziladi: brauzerda faqat rus tili tanlanganda yuklanadi
 * (o'zbek tilidagi foydalanuvchilar uni yuklamaydi). Serverda ishga tushishda bir marta.
 */
let RU_DICT: Record<string, string> = {};
export function registerRussian(dict: Record<string, string>): void {
  RU_DICT = dict;
}
export function russianLoaded(): boolean {
  return Object.keys(RU_DICT).length > 0;
}

function lookup(lang: Lang, key: string): string | undefined {
  if (lang === "ru") return RU_DICT[key] ?? UZ[key];
  return UZ[key];
}

/**
 * Tarjima. Kalit o'zbekcha matnning o'zi yoki nuqtali kalit.
 * Parametr qiymati ham kalit bo'lsa (masalan "grade.type.control"), u ham tarjima qilinadi.
 */
export function translate(lang: Lang, key: string, params?: Params, vocab: Vocab = "school"): string {
  const template = vocab === "center" ? centerTemplate(lang, key) : lookup(lang, key) ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = params[k];
    if (v === undefined) return "";
    if (typeof v === "string" && /^[a-z]+(\.[a-zA-Z]+)+$/.test(v)) return lookup(lang, v) ?? v;
    return String(v);
  });
}

function centerTemplate(lang: Lang, key: string): string {
  if (lang === "ru") {
    const ru = RU_CENTER[key];
    if (ru) return ru;
    const plain = lookup(lang, key);
    // Ruscha tarjimasi yo'q (o'zbekcha qaytdi): o'zbekcha qoidasi bilan
    return plain && RU_DICT[key] ? plain : uzCenterWords(UZ_CENTER[key] ?? plain ?? key);
  }
  return uzCenterWords(UZ_CENTER[key] ?? lookup(lang, key) ?? key);
}
