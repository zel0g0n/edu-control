import { addDays, dayKey, isoWeekday, parseDay } from "@edunazorat/shared";

import { currentLang, t } from "./i18n";

const MONTHS = {
  uz: ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"],
  ru: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
};
const MONTHS_TITLE = {
  uz: ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"],
  ru: ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"],
};
const WEEKDAYS = {
  uz: ["Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"],
  ru: ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"],
};
const WEEKDAYS_SHORT = {
  uz: ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"],
  ru: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
};

const pad = (n: number) => String(n).padStart(2, "0");
const toDate = (d: Date | number | string) => (typeof d === "string" ? parseDay(d) : new Date(d));

export function weekdayName(n: number): string {
  return WEEKDAYS[currentLang()][n - 1];
}
export function weekdayShort(n: number): string {
  return WEEKDAYS_SHORT[currentLang()][n - 1];
}

export const fmt = {
  date(d: Date | number | string): string {
    const x = toDate(d);
    const l = currentLang();
    return l === "ru" ? `${x.getDate()} ${MONTHS.ru[x.getMonth()]}` : `${x.getDate()}-${MONTHS.uz[x.getMonth()]}`;
  },
  dateFull(d: Date | number | string): string {
    const x = toDate(d);
    return `${fmt.date(x)} ${x.getFullYear()}`;
  },
  dateShort(d: Date | number | string): string {
    const x = toDate(d);
    return `${pad(x.getDate())}.${pad(x.getMonth() + 1)}`;
  },
  month(key: string): string {
    const [y, m] = key.split("-").map(Number);
    return `${MONTHS_TITLE[currentLang()][m - 1]} ${y}`;
  },
  time(d: Date | number): string {
    const x = new Date(d);
    return `${pad(x.getHours())}:${pad(x.getMinutes())}`;
  },
  weekday(d: Date | string): string {
    return weekdayName(isoWeekday(d));
  },
  money(amount: number): string {
    const s = Math.abs(Math.round(amount)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return `${amount < 0 ? "−" : ""}${s} ${currentLang() === "ru" ? "сум" : "so'm"}`;
  },
  moneyShort(amount: number): string {
    if (Math.abs(amount) >= 1_000_000) {
      const v = (amount / 1_000_000).toFixed(1).replace(/\.0$/, "");
      return currentLang() === "ru" ? `${v.replace(".", ",")} млн сум` : `${v} mln so'm`;
    }
    return fmt.money(amount);
  },
  number(n: number, digits = 1): string {
    const s = n.toFixed(digits);
    return currentLang() === "ru" ? s.replace(".", ",") : s;
  },
  percent(r: number | null): string {
    return r === null ? "—" : `${Math.round(r * 100)}%`;
  },
  phone(raw: string): string {
    const d = raw.replace(/\D/g, "");
    if (d.length !== 12) return raw;
    return `+${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10, 12)}`;
  },
  relative(t: number, now = Date.now()): string {
    const ru = currentLang() === "ru";
    const min = Math.floor((now - t) / 60000);
    if (min < 1) return ru ? "сейчас" : "hozir";
    if (min < 60) return ru ? `${min} мин назад` : `${min} daqiqa oldin`;
    if (dayKey(t) === dayKey(now)) return `${ru ? "сегодня" : "bugun"} ${fmt.time(t)}`;
    if (dayKey(t) === addDays(dayKey(now), -1)) return `${ru ? "вчера" : "kecha"} ${fmt.time(t)}`;
    return fmt.date(t);
  },
  /** Kiritilayotgan raqam (998 siz, 0-9 ta raqam): "90 123 45 67" ko'rinishida. */
  phoneLocal(digits: string): string {
    const d = digits.replace(/\D/g, "").slice(0, 9);
    return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(" ");
  },
  initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (!parts[0]) return "?";
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  },
  fileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${fmt.number(bytes / 1024 / 1024)} MB`;
  },
};

/** "1-chorak" kabi standart nomlar foydalanuvchi tilida; boshqa nomlar o'zgarishsiz. */
export function termLabel(name: string): string {
  const m = /^(\d)-chorak$/.exec(name.trim());
  return m ? t("{n}-chorak", { n: m[1] }) : name;
}

/** Tizim yozgan baho izohi (uy vazifasi bahosi) foydalanuvchi tilida. */
export function gradeComment(c: string | undefined): string | undefined {
  if (!c) return c;
  const m = /^Uy vazifasi: (.*)$/.exec(c);
  return m ? t("Uy vazifasi: {title}", { title: m[1] }) : c;
}
