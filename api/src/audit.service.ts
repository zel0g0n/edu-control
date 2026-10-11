import { Inject, Injectable, Logger } from "@nestjs/common";
import { auditSummary, AUDIT_SKIP, type AppUser, type AuditEntry, type Patch } from "@edunazorat/shared";

import { SQL, type Sql } from "./db/sql";

interface Row { id: string; at: Date; actor_id: string | null; actor_role: string | null; institution_id: string | null; action: string; target: string | null; details: unknown; ip: string | null }

/**
 * Faoliyat jurnali (o'zgartirib bo'lmaydi: faqat qo'shiladi). Direktor o'z muassasasini,
 * super admin hammasini ko'radi. Jurnal yozilmasa ham asosiy ish to'xtamaydi, lekin xato logga tushadi.
 */
@Injectable()
export class AuditService {
  private readonly log = new Logger("Audit");

  constructor(@Inject(SQL) private readonly sql: Sql) {}

  async record(e: { actor?: AppUser | null; institutionId?: string | null; action: string; target?: string; details?: Record<string, string | number | boolean>; ip?: string }) {
    try {
      await this.sql.query(
        "INSERT INTO audit_log (actor_id, actor_role, institution_id, action, target, details, ip) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [e.actor?.id ?? null, e.actor?.role ?? null, e.institutionId ?? e.actor?.institutionId ?? null, e.action, e.target ?? null, JSON.stringify(e.details ?? {}), e.ip?.slice(0, 64) ?? null],
      );
    } catch (err) {
      this.log.error(`Jurnalga yozilmadi (${e.action}): ${err}`);
    }
  }

  /** Buyruqdan keyin. */
  async command(actor: AppUser, name: string, input: unknown, patch: Patch, ip: string, institutionId?: string) {
    if (AUDIT_SKIP.has(name)) return;
    const { target, details } = auditSummary(name, input, patch);
    await this.record({ actor, institutionId: institutionId ?? actor.institutionId, action: name, target, details, ip });
  }

  async list(viewer: AppUser, opts: { before?: string; limit?: number; institutionId?: string }): Promise<AuditEntry[]> {
    const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200);
    const before = /^\d{1,18}$/.test(opts.before ?? "") ? opts.before : null;
    const inst = viewer.role === "superAdmin" ? (opts.institutionId || null) : viewer.institutionId ?? "__none__";
    const rows = await this.sql.query<Row>(
      `SELECT a.id::text AS id, at, actor_id, actor_role, institution_id, action, target, details, ip FROM audit_log a
        WHERE ($1::text IS NULL OR institution_id = $1) AND ($2::bigint IS NULL OR a.id < $2::bigint)
        ORDER BY a.id DESC LIMIT $3`,
      [inst, before, limit],
    );
    return rows.map((r) => ({
      id: r.id, at: new Date(r.at).getTime(), actorId: r.actor_id ?? undefined, actorRole: r.actor_role ?? undefined,
      institutionId: r.institution_id ?? undefined, action: r.action, target: r.target ?? undefined,
      details: (typeof r.details === "string" ? JSON.parse(r.details) : r.details) as AuditEntry["details"],
      // IP faqat super adminga
      ip: viewer.role === "superAdmin" ? r.ip ?? undefined : undefined,
    }));
  }
}
