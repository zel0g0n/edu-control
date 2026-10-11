import { Inject, Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { randomBytes } from "node:crypto";

import { SQL, type Sql } from "./db/sql";

/** Server nusxalari orasidagi xabarlar (Postgres NOTIFY). */
export type ClusterMessage =
  | { t: "patch"; seq: number }
  | { t: "session"; sid?: string; user?: string; except?: string }
  | { t: "cred"; user: string }
  | { t: "mfa"; user: string };

const CHANNEL = "edunazorat";

/**
 * Bir nechta API nusxasi (load balancer ortida) bitta Postgres bilan ishlaydi. Har o'zgarish
 * NOTIFY bilan boshqa nusxalarga yetkaziladi; xabar yo'qolsa ham StoreService vaqti-vaqti bilan
 * bazadan tekshiradi, sessiyalar esa qisqa keshdan keyin bazadan qayta o'qiladi.
 */
@Injectable()
export class ClusterService implements OnModuleDestroy {
  private readonly log = new Logger("Cluster");
  /** Shu nusxaning identifikatori (o'z xabarini qayta ishlamaslik uchun). */
  readonly id = randomBytes(6).toString("hex");
  private handlers: ((m: ClusterMessage) => void)[] = [];
  private stop: (() => Promise<void>) | null = null;
  private starting: Promise<void> | null = null;

  constructor(@Inject(SQL) private readonly sql: Sql) {}

  /** Birinchi obunada tinglash boshlanadi. */
  async subscribe(fn: (m: ClusterMessage) => void): Promise<void> {
    this.handlers.push(fn);
    this.starting ??= this.sql.listen(CHANNEL, (payload) => this.dispatch(payload)).then((off) => { this.stop = off; });
    await this.starting;
  }

  private dispatch(payload: string) {
    let msg: (ClusterMessage & { from?: string }) | null = null;
    try {
      msg = JSON.parse(payload);
    } catch {
      return;
    }
    if (!msg || msg.from === this.id) return;
    for (const h of this.handlers) {
      try {
        h(msg);
      } catch (e) {
        this.log.error(`Xabarni qayta ishlashda xato: ${e}`);
      }
    }
  }

  /** Xabar yuborish (tranzaksiya ichida bo'lsa: commit bo'lganda yetadi). */
  async publish(msg: ClusterMessage, q: Pick<Sql, "query"> = this.sql): Promise<void> {
    await q.query("SELECT pg_notify($1, $2)", [CHANNEL, JSON.stringify({ ...msg, from: this.id })]);
  }

  async onModuleDestroy() {
    await this.stop?.();
  }
}
