import type { AppNotification, UserRole } from "@edunazorat/shared";

import { fmt } from "./format";
import { translate, type Lang } from "./i18n";

/** Bildirishnoma havolasi foydalanuvchi roliga mos. */
export function notificationHref(n: AppNotification, role: UserRole): string | undefined {
  if (!n.link) return undefined;
  if (role === "student") return n.link.replace(/^\/parent/, "/student");
  if (role === "parent") return n.link.replace(/^\/student/, "/parent");
  return n.link;
}

/** Matn: parametrlar (sana, oy, summa, to'lov usuli) foydalanuvchi tilida formatlanadi. */
export function notificationText(lang: Lang, n: AppNotification): string {
  const p: Record<string, string | number> = { ...n.params };
  if (typeof p.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.due)) p.due = fmt.date(p.due);
  if (typeof p.month === "string" && /^\d{4}-\d{2}$/.test(p.month)) p.month = fmt.month(p.month);
  for (const k of ["amount", "remaining"]) if (typeof p[k] === "number") p[k] = fmt.money(p[k] as number);
  if (typeof p.method === "string") p.method = `pay.${p.method}`;
  return translate(lang, n.key, p);
}
