import { registerRussian, russianLoaded, translate, type Lang, type Params, type Vocab } from "@edunazorat/shared";

export { translate, type Lang, type Params, type Vocab };

let current: Lang = "uz";
let vocab: Vocab = "school";
export function setCurrentVocab(v: Vocab) {
  vocab = v;
}
export function setCurrentLang(l: Lang) {
  current = l;
}
/** Rus tili tanlansa lug'at alohida yuklanadi (o'zbek tilida brauzerga kelmaydi). */
export async function loadLang(l: Lang): Promise<void> {
  if (l !== "ru" || russianLoaded()) return;
  const { RU } = await import("@edunazorat/shared/i18n/ru");
  registerRussian(RU);
}
export function currentLang(): Lang {
  return current;
}

export function t(key: string, params?: Params): string {
  return translate(current, key, params, vocab);
}
