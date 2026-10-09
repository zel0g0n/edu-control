import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import type { Response } from "express";
import { isEmptyPatch, scopePatch } from "@edunazorat/shared";

import { StoreService, type Change } from "./store.service";

/**
 * Server-Sent Events: har bir foydalanuvchiga faqat o'zi ko'radigan
 * o'zgarishlar (shared/scope) yuboriladi. Tuzilma o'zgarsa: "reload".
 */
@Injectable()
export class RealtimeService implements OnModuleDestroy {
  private clients = new Map<string, Set<Response>>();
  private ping: NodeJS.Timeout;

  constructor(@Inject(StoreService) private readonly store: StoreService) {
    store.events.on("change", (c: Change) => this.broadcast(c));
    // Proksi/telefon ulanishni uzib qo'ymasligi uchun.
    this.ping = setInterval(() => this.each((res) => res.write(": ping\n\n")), 25_000);
    this.ping.unref();
  }

  onModuleDestroy() {
    clearInterval(this.ping);
    this.each((res) => res.end());
  }

  add(userId: string, res: Response) {
    const set = this.clients.get(userId) ?? new Set();
    set.add(res);
    this.clients.set(userId, set);
    res.on("close", () => {
      set.delete(res);
      if (set.size === 0) this.clients.delete(userId);
    });
  }

  get connected(): number {
    let n = 0;
    for (const s of this.clients.values()) n += s.size;
    return n;
  }

  private each(fn: (res: Response) => void) {
    for (const set of this.clients.values()) for (const res of set) fn(res);
  }

  private broadcast(c: Change) {
    const db = this.store.db;
    const actorInst = c.actorId ? this.store.user(c.actorId)?.institutionId : undefined;
    for (const [userId, set] of this.clients) {
      const u = this.store.user(userId);
      if (!u || !u.active) {
        for (const res of set) res.end();
        continue;
      }
      let event: string | null = null;
      let data = "{}";
      if (c.structural && (u.role === "superAdmin" || !actorInst || u.institutionId === actorInst || u.childIds.some((id) => db.students.find((s) => s.id === id)?.institutionId === actorInst))) {
        event = "reload";
      } else {
        const p = scopePatch(db, u, c.patch);
        if (!isEmptyPatch(p)) {
          event = "patch";
          data = JSON.stringify(p);
        }
      }
      if (event) for (const res of set) res.write(`event: ${event}\ndata: ${data}\n\n`);
    }
  }
}
