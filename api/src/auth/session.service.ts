import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { CommandError } from "@edunazorat/shared";

import { ClusterService } from "../cluster.service";
import { SQL, type Sql } from "../db/sql";
import { StoreService } from "../store.service";

/** Faol bo'lmasa shuncha vaqtdan keyin chiqib ketadi. */
export const SESSION_IDLE_MS = 30 * 86_400_000;
/** Har qanday holatda ham shuncha vaqtdan keyin qayta kirish kerak. */
export const SESSION_MAX_MS = 90 * 86_400_000;
/** last_seen bazaga shu oraliqda yoziladi (har so'rovda emas). */
const TOUCH_MS = 10 * 60_000;
/** Sessiya keshi: shundan keyin bazadan qayta o'qiladi (boshqa nusxada bekor qilingan bo'lsa). */
const CACHE_MS = 30_000;
/** /events chiptasi: bir martalik, qisqa muddatli (tokenni URL'da yubormaslik uchun). */
const TICKET_S = 60;
/** Bir vaqtda ikki oyna yangilasa: eski refresh token shu oraliqda "poyga" deb hisoblanadi, o'g'irlik emas. */
const REFRESH_RACE_MS = 30_000;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

interface Session {
  id: string;
  userId: string;
  createdAt: number;
  lastSeen: number;
  revoked: boolean;
  /** Keshga olingan vaqt. */
  fetchedAt: number;
}

interface Row {
  id: string; user_id: string; created_at: Date; last_seen: Date; revoked_at: Date | null; agent: string; ip: string;
  refresh_hash: string | null; prev_hash: string | null; rotated_at: Date | null;
}

export interface SessionInfo {
  id: string;
  createdAt: number;
  lastSeen: number;
  agent: string;
  current: boolean;
}

const COLS = "id, user_id, created_at, last_seen, revoked_at, agent, ip, refresh_hash, prev_hash, rotated_at";

/**
 * Server tomonidagi sessiyalar (Postgres — barcha nusxalar uchun yagona manba, xotirada qisqa kesh).
 * Bekor qilish boshqa nusxalarga darhol (NOTIFY) yetadi; xabar yo'qolsa ham kesh 30 soniyada eskiradi.
 */
@Injectable()
export class SessionService implements OnModuleInit {
  private readonly log = new Logger("Session");
  private readonly cache = new Map<string, Session>();
  /** Boshqa nusxada sessiya bekor qilinganda (realtime ulanishni uzish uchun). */
  onRevoked: ((m: { sid?: string; user?: string; except?: string }) => void) | null = null;

  constructor(
    @Inject(SQL) private readonly sql: Sql,
    @Inject(StoreService) private readonly store: StoreService,
    @Inject(ClusterService) private readonly cluster: ClusterService,
  ) {}

  async onModuleInit() {
    await this.store.ready;
    await this.cluster.subscribe((m) => {
      if (m.t !== "session") return;
      this.forget(m);
      this.onRevoked?.(m);
    });
    // Eski yozuvlar va chiptalarni tozalash
    await this.sql.query("DELETE FROM sessions WHERE created_at < now() - interval '365 days'");
    await this.sql.query("DELETE FROM event_tickets WHERE exp < now()");
  }

  private forget(m: { sid?: string; user?: string; except?: string }) {
    if (m.sid) this.cache.delete(m.sid);
    if (m.user) for (const [k, s] of this.cache) if (s.userId === m.user && k !== m.except) this.cache.delete(k);
  }

  private toSession(r: Row): Session {
    return {
      id: r.id, userId: r.user_id, createdAt: new Date(r.created_at).getTime(), lastSeen: new Date(r.last_seen).getTime(),
      revoked: !!r.revoked_at, fetchedAt: Date.now(),
    };
  }

  private remember(s: Session) {
    this.cache.set(s.id, s);
    if (this.cache.size > 20_000) this.cache.delete(this.cache.keys().next().value!);
  }

  private async fetch(sid: string): Promise<Session | undefined> {
    const [r] = await this.sql.query<Row>(`SELECT ${COLS} FROM sessions WHERE id = $1`, [sid]);
    if (!r) return undefined;
    const s = this.toSession(r);
    this.remember(s);
    return s;
  }

  /** Yangi sessiya: id va refresh token ("sid.maxfiy"). */
  async create(userId: string, agent: string, ip: string): Promise<{ sid: string; refreshToken: string }> {
    const id = randomBytes(18).toString("base64url");
    const secret = randomBytes(32).toString("base64url");
    await this.sql.query("INSERT INTO sessions (id, user_id, agent, ip, refresh_hash, rotated_at) VALUES ($1, $2, $3, $4, $5, now())",
      [id, userId, agent.slice(0, 200), ip.slice(0, 64), sha(secret)]);
    const now = Date.now();
    this.remember({ id, userId, createdAt: now, lastSeen: now, revoked: false, fetchedAt: now });
    return { sid: id, refreshToken: `${id}.${secret}` };
  }

  /** Sessiya faol va shu foydalanuvchiniki bo'lishi kerak; aks holda 401. */
  async check(sid: string | undefined, userId: string): Promise<void> {
    if (!sid) throw new CommandError("err.sessionExpired", {}, 401);
    const now = Date.now();
    let s = this.cache.get(sid);
    if (!s || now - s.fetchedAt > CACHE_MS) s = await this.fetch(sid);
    if (!s || s.revoked || s.userId !== userId || now - s.lastSeen > SESSION_IDLE_MS || now - s.createdAt > SESSION_MAX_MS) {
      throw new CommandError("err.sessionExpired", {}, 401);
    }
    if (now - s.lastSeen > TOUCH_MS) {
      s.lastSeen = now;
      this.sql.query("UPDATE sessions SET last_seen = now() WHERE id = $1", [s.id]).catch((e) => this.log.warn(`last_seen: ${e}`));
    }
  }

  /**
   * Refresh token almashtirish (har safar yangisi, eskisi bekor). Eski token qayta ishlatilsa
   * (o'g'irlangan bo'lishi mumkin) butun sessiya bekor qilinadi. Bazada atomar: ikki nusxa
   * bir tokenni bir vaqtda almashtira olmaydi.
   */
  async refresh(token: string): Promise<{ userId: string; sid: string; refreshToken: string }> {
    const [sid, secret] = String(token ?? "").split(".");
    if (!sid || !secret) throw new CommandError("err.sessionExpired", {}, 401);
    const h = sha(secret);
    const next = randomBytes(32).toString("base64url");
    const [r] = await this.sql.query<Row>(
      `UPDATE sessions SET prev_hash = refresh_hash, refresh_hash = $3, rotated_at = now(), last_seen = now()
        WHERE id = $1 AND refresh_hash = $2 AND revoked_at IS NULL
          AND last_seen > now() - interval '30 days' AND created_at > now() - interval '90 days'
        RETURNING ${COLS}`,
      [sid, h, sha(next)],
    );
    if (r) {
      this.remember(this.toSession(r));
      return { userId: r.user_id, sid, refreshToken: `${sid}.${next}` };
    }
    const [cur] = await this.sql.query<Row>(`SELECT ${COLS} FROM sessions WHERE id = $1`, [sid]);
    if (!cur || cur.revoked_at) throw new CommandError("err.sessionExpired", {}, 401);
    if (cur.prev_hash && same(h, cur.prev_hash) && cur.rotated_at && Date.now() - new Date(cur.rotated_at).getTime() < REFRESH_RACE_MS) {
      // Boshqa oyna hozirgina yangiladi: mijoz yangi tokenni qayta o'qiydi
      throw new CommandError("err.refreshRace", {}, 409);
    }
    await this.revoke(sid);
    this.log.warn(`Refresh token qayta ishlatildi, sessiya bekor: ${cur.user_id}`);
    const e = new CommandError("err.sessionExpired", {}, 401);
    (e as CommandError & { reused?: string }).reused = cur.user_id;
    throw e;
  }

  async revoke(sid: string): Promise<void> {
    this.cache.delete(sid);
    await this.sql.query("UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL", [sid]);
    await this.cluster.publish({ t: "session", sid });
  }

  /** Foydalanuvchining barcha sessiyalari (except: joriy qurilma qoladi). */
  async revokeAll(userId: string, except?: string): Promise<number> {
    this.forget({ user: userId, except });
    const rows = await this.sql.query<{ id: string }>(
      "UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL AND id <> $2 RETURNING id", [userId, except ?? ""]);
    await this.cluster.publish({ t: "session", user: userId, except });
    return rows.length;
  }

  async list(userId: string, current?: string): Promise<SessionInfo[]> {
    const rows = await this.sql.query<Row>(
      `SELECT ${COLS} FROM sessions WHERE user_id = $1 AND revoked_at IS NULL AND last_seen > now() - interval '30 days'
        AND created_at > now() - interval '90 days' ORDER BY last_seen DESC LIMIT 50`,
      [userId]);
    return rows.map((r) => ({ id: r.id, createdAt: new Date(r.created_at).getTime(), lastSeen: new Date(r.last_seen).getTime(), agent: r.agent, current: r.id === current }));
  }

  /** Real vaqt ulanishi uchun bir martalik chipta (istalgan nusxada ishlatiladi; bazada faqat xeshi). */
  async ticket(userId: string, sid: string): Promise<string> {
    const t = randomBytes(24).toString("base64url");
    await this.sql.query("INSERT INTO event_tickets (id, user_id, sid, exp) VALUES ($1, $2, $3, now() + make_interval(secs => $4))", [sha(t), userId, sid, TICKET_S]);
    return t;
  }

  async redeem(ticket: string): Promise<{ userId: string; sid: string }> {
    const [r] = await this.sql.query<{ user_id: string; sid: string }>(
      "DELETE FROM event_tickets WHERE id = $1 AND exp > now() RETURNING user_id, sid", [sha(String(ticket ?? ""))]);
    if (!r) throw new CommandError("err.forbidden", {}, 401);
    await this.check(r.sid, r.user_id);
    return { userId: r.user_id, sid: r.sid };
  }
}
