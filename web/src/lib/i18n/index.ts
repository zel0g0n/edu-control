import { translate, type Lang, type Params, type Vocab } from "@edunazorat/shared";

export { translate, type Lang, type Params, type Vocab };

let current: Lang = "uz";
let vocab: Vocab = "school";
export function setCurrentVocab(v: Vocab) {
  vocab = v;
}
export function setCurrentLang(l: Lang) {
  current = l;
}
export function currentLang(): Lang {
  return current;
}

export function t(key: string, params?: Params): string {
  return translate(current, key, params, vocab);
}
