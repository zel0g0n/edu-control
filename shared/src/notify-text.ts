import { translate, type Lang } from "./i18n";
import type { AppNotification } from "./types";

const MONTHS: Record<Lang, string[]> = {
  uz: ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"],
  ru: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
};
const MONTHS_TITLE: Record<Lang, string[]> = {
  uz: ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"],
  ru: ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"],
};

export function moneyText(lang: Lang, amount: number): string {
  const s = Math.abs(Math.round(amount)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${amount < 0 ? "−" : ""}${s} ${lang === "ru" ? "сум" : "so'm"}`;
}

/**
 * Bildirishnoma matni (server tomonida: Web Push, SMS). Brauzer ilovasi
 * o'zining boyroq formatlashini ishlatadi, natija bir xil ma'noda.
 */
export function notificationTextPlain(lang: Lang, n: Pick<AppNotification, "key" | "params">): string {
  const p: Record<string, string | number> = { ...n.params };
  if (typeof p.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.due)) {
    const [, m, d] = p.due.split("-").map(Number);
    p.due = lang === "ru" ? `${d} ${MONTHS.ru[m - 1]}` : `${d}-${MONTHS.uz[m - 1]}`;
  }
  if (typeof p.month === "string" && /^\d{4}-\d{2}$/.test(p.month)) {
    const [y, m] = p.month.split("-").map(Number);
    p.month = `${MONTHS_TITLE[lang][m - 1]} ${y}`;
  }
  for (const k of ["amount", "remaining"]) if (typeof p[k] === "number") p[k] = moneyText(lang, p[k] as number);
  if (typeof p.method === "string") p.method = `pay.${p.method}`;
  return translate(lang, n.key, p);
}
