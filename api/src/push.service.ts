import { Inject, Injectable, Logger } from "@nestjs/common";
import webpush from "web-push";
import { notificationTextPlain, type AppNotification, type Lang } from "@edunazorat/shared";

import { CONFIG, type Config } from "./config";
import { SQL, type Sql } from "./db/sql";
import { StoreService, type Change } from "./store.service";

/**
 * Web Push: brauzer/telefon yopiq bo'lsa ham bildirishnoma (Android Chrome,
 * kompyuter brauzerlari; iPhone'da ilova "Bosh ekranga qo'shilgan" bo'lsa).
 * VAPID kalitlari: npm run vapid -w api
 */
@Injectable()
export class PushService {
  private readonly log = new Logger("Push");
  readonly enabled: boolean;

  constructor(@Inject(CONFIG) private readonly config: Config, @Inject(SQL) private readonly sql: Sql, @Inject(StoreService) private readonly store: StoreService) {
    let ok = !!(config.vapidPublic && config.vapidPrivate);
    if (ok) {
      try {
        webpush.setVapidDetails(config.vapidSubject, config.vapidPublic!, config.vapidPrivate!);
      } catch (e) {
        // Noto'g'ri kalit server ishini to'xtatmasin: bildirishnoma faqat sayt ochiq turganda keladi
        ok = false;
        this.log.error(`VAPID kalitlari noto'g'ri, Web Push o'chirildi: ${(e as Error).message}. Qayta yarating: npm run vapid -w api`);
      }
    }
    this.enabled = ok;
    store.events.on("change", (c: Change) => {
      const fresh = (c.patch.upsert?.notifications ?? []).filter((n) => !n.read && store.clock() - n.time < 60_000);
      if (fresh.length && this.enabled) void this.deliver(fresh).catch((e) => this.log.warn(String(e)));
    });
  }

  get publicKey(): string | null {
    return this.enabled ? this.config.vapidPublic! : null;
  }

  async subscribe(userId: string, sub: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }, lang: Lang) {
    if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error("bad subscription");
    await this.sql.query(
      `INSERT INTO push_subscriptions (endpoint, user_id, lang, data) VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, lang = EXCLUDED.lang, data = EXCLUDED.data`,
      [sub.endpoint, userId, lang, JSON.stringify(sub)],
    );
  }

  async unsubscribeUser(userId: string, endpoint?: string) {
    if (endpoint) await this.sql.query("DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2", [endpoint, userId]);
  }

  /** Havola foydalanuvchi roliga mos (o'quvchi: /student/..., ota-ona: /parent/...). */
  private link(n: AppNotification): string {
    const role = this.store.user(n.userId)?.role;
    const l = n.link ?? "/";
    return role === "student" ? l.replace(/^\/parent/, "/student") : role === "parent" ? l.replace(/^\/student/, "/parent") : l;
  }

  private async deliver(items: AppNotification[]) {
    const ids = [...new Set(items.map((n) => n.userId))];
    const subs = await this.sql.query<{ endpoint: string; user_id: string; lang: Lang; data: unknown }>(
      "SELECT endpoint, user_id, lang, data FROM push_subscriptions WHERE user_id = ANY($1::text[])", [ids]);
    for (const n of items) {
      for (const s of subs.filter((x) => x.user_id === n.userId)) {
        const sub = typeof s.data === "string" ? JSON.parse(s.data) : s.data;
        // Rasm (yuz kesimi) push'ga qo'shilmaydi: hajm cheklovi va maxfiylik, ilovada ko'rinadi.
        const payload = JSON.stringify({ title: "EduNazorat", body: notificationTextPlain(s.lang, n), tag: n.id, url: this.link(n) });
        try {
          await webpush.sendNotification(sub, payload, { TTL: 24 * 3600 });
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await this.sql.query("DELETE FROM push_subscriptions WHERE endpoint = $1", [s.endpoint]);
          else this.log.warn(`push xatosi ${code ?? ""}`);
        }
      }
    }
  }
}
