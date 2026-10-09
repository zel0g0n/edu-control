import { translate, type Lang, type Params } from "@edunazorat/shared";

export { translate, type Lang, type Params };

let current: Lang = "uz";
export function setCurrentLang(l: Lang) {
  current = l;
}
export function currentLang(): Lang {
  return current;
}

export function t(key: string, params?: Params): string {
  return translate(current, key, params);
}
