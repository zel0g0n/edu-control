import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { EventEmitter } from "node:events";
import {
  CommandError, STRUCTURAL_COMMANDS, applyPatch, assignMissingReceiptIds, ensureStudentAccounts, emptyDatabase, executeCommand, seedDatabase,
  type AppUser, type CollectionName, type CommandMap, type CommandName, type Database, type Patch,
} from "@edunazorat/shared";

import { ClusterService } from "./cluster.service";
import { CONFIG, type Config } from "./config";
import { migrate } from "./db/schema";
import { SQL, type Sql } from "./db/sql";

const COLLECTIONS: CollectionName[] = [
  "institutions", "users", "classes", "students", "lessons", "terms", "grades", "attendance",
  "homeworks", "submissions", "invoices", "threads", "messages", "notifications", "leads",
];

export interface Change {
  patch: Patch;
  actorId: string | null;
  command: string;
  structural: boolean;
  /** true: o'zgarish shu nusxada bajarildi (push faqat shu yerdan yuboriladi). */
  local: boolean;
}

/** Buyruqlar butun klaster bo'yicha ketma-ket: Postgres advisory lock kaliti. */
const WRITE_LOCK = 724_001;
/** Xabar yo'qolsa ham: shu oraliqda bazadagi yangi o'zgarishlar tekshiriladi. */
const POLL_MS = 5_000;

/** Yozuvning muassasasi (indeks uchun; ruxsatlar shared/scope da). */
function institutionOf(db: Database, name: CollectionName, x: Record<string, unknown>): string | null {
  if (typeof x.institutionId === "string") return x.institutionId;
  if (name === "institutions") return x.id as string;
  const sid = x.studentId as string | undefined;
  if (sid) return db.students.find((s) => s.id === sid)?.institutionId ?? null;
  if (name === "lessons" || name === "homeworks") return db.classes.find((c) => c.id === x.classId)?.institutionId ?? null;
  return null;
}

/**
 * Ma'lumotlar xotirada (tez o'qish uchun) va Postgres'da (doimiy saqlash).
 * Bir nechta server nusxasi bo'lishi mumkin: har buyruq Postgres advisory lock ostida bajariladi,
 * natija (patch) patch_log jadvaliga yoziladi va NOTIFY bilan boshqa nusxalarga yetkaziladi.
 * Har nusxa xotirasini patch_log bo'yicha ketma-ket yangilaydi (seq).
 */
@Injectable()
export class StoreService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("Store");
  db: Database = emptyDatabase();
  readonly events = new EventEmitter();
  private queue: Promise<unknown> = Promise.resolve();
  clock: () => number = () => Date.now();

  /** Xotiradagi baza qaysi patch_log yozuvigacha yangilangan. */
  private seq = 0;
  private poll: NodeJS.Timeout | null = null;
  private prune: NodeJS.Timeout | null = null;

  constructor(
    @Inject(SQL) private readonly sql: Sql,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(ClusterService) private readonly cluster: ClusterService,
  ) {
    this.events.setMaxListeners(0);
  }

  private markReady!: () => void;
  /** Baza yuklanib, migratsiyalar tugagach (boshqa xizmatlar shuni kutadi). */
  readonly ready = new Promise<void>((r) => { this.markReady = r; });

  async onModuleInit() {
    await migrate(this.sql);
    // Bir vaqtda bir nechta nusxa ishga tushsa ham demo ma'lumot bir marta yoziladi
    await this.sql.tx(async (q) => {
      await q.query("SELECT pg_advisory_xact_lock($1)", [WRITE_LOCK]);
      const [{ n }] = await q.query<{ n: string | number }>("SELECT count(*) AS n FROM records WHERE collection = 'users'");
      if (Number(n) === 0 && this.config.seedDemo) {
        this.log.warn("Baza bo'sh: demo ma'lumotlar yozilmoqda (SEED_DEMO=true)");
        await this.writeAll(q, seedDatabase(this.clock()));
      }
    });
    await this.load();
    await this.cluster.subscribe((m) => {
      if (m.t === "patch" && m.seq > this.seq) void this.catchUp();
    });
    // Har o'quvchining akkaunti (login ism.familiya): eski ma'lumotlar uchun bir marta
    const acc = await this.applySystem("accounts.ensure", (db) => {
      const a = ensureStudentAccounts(db);
      return a.users.length ? { upsert: { users: a.users, students: a.students } } : {};
    });
    if (acc.upsert?.users?.length) this.log.log(`O'quvchi akkauntlari yaratildi: ${acc.upsert.users.length}`);
    // Eski o'quvchilarga Kvitansiya ID berish (bir marta)
    const rid = await this.applySystem("receipt.assign", (db) => {
      const missing = assignMissingReceiptIds(db);
      return missing.length ? { upsert: { students: missing } } : {};
    });
    if (rid.upsert?.students?.length) this.log.log(`Kvitansiya ID berildi: ${rid.upsert.students.length} o'quvchi`);
    this.log.log(`Yuklandi: ${this.db.institutions.length} muassasa, ${this.db.users.length} foydalanuvchi, ${this.db.attendance.length} davomat yozuvi`);
    this.poll = setInterval(() => void this.catchUp().catch((e) => this.log.warn(`Yangilash: ${e}`)), POLL_MS);
    this.poll.unref();
    // patch_log faqat nusxalarni sinxronlash uchun: 2 kundan eskisi kerak emas (yozuvlar records'da)
    this.prune = setInterval(() => void this.sql.query("DELETE FROM patch_log WHERE at < now() - interval '2 days'").catch(() => undefined), 3_600_000);
    this.prune.unref();
    this.markReady();
  }

  onModuleDestroy() {
    if (this.poll) clearInterval(this.poll);
    if (this.prune) clearInterval(this.prune);
  }

  /** Bazadan to'liq yuklash: yozuvlar va ular qaysi patch_log raqamigacha ekanligi (bir xil holat). */
  async load() {
    const { rows, seq } = await this.sql.tx(async (q) => {
      await q.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      const [m] = await q.query<{ seq: string | number | null }>("SELECT max(seq) AS seq FROM patch_log");
      const r = await q.query<{ collection: CollectionName; data: unknown }>("SELECT collection, data FROM records");
      return { rows: r, seq: Number(m?.seq ?? 0) };
    });
    const db = emptyDatabase();
    for (const r of rows) {
      const list = db[r.collection] as unknown[] | undefined;
      if (Array.isArray(list)) list.push(typeof r.data === "string" ? JSON.parse(r.data) : r.data);
    }
    this.db = db;
    this.seq = seq;
  }

  /** Boshqa nusxalar yozgan o'zgarishlarni xotiraga qo'llash (ketma-ket). */
  catchUp(): Promise<void> {
    return this.serial(() => this.applyPending(this.sql));
  }

  private async applyPending(q: Pick<Sql, "query">) {
    const rows = await q.query<{ seq: string | number; patch: unknown; actor_id: string | null; command: string; structural: boolean }>(
      "SELECT seq, patch, actor_id, command, structural FROM patch_log WHERE seq > $1 ORDER BY seq LIMIT 5000", [this.seq],
    );
    if (!rows.length) return;
    // Uzilish bo'lsa (log tozalangan yoki juda ko'p): to'liq qayta yuklash
    if (Number(rows[0].seq) !== this.seq + 1 || rows.length === 5000) {
      const [{ min }] = await q.query<{ min: string | number | null }>("SELECT min(seq) AS min FROM patch_log");
      if (rows.length === 5000 || (min !== null && Number(min) > this.seq + 1)) {
        this.log.warn("Ko'p o'zgarish o'tkazib yuborildi: baza qayta yuklanmoqda");
        await this.load();
        this.events.emit("change", { patch: {}, actorId: null, command: "reload", structural: true, local: false } satisfies Change);
        return;
      }
    }
    if (rows.some((r) => r.command === "reload")) {
      await this.load();
      this.events.emit("change", { patch: {}, actorId: null, command: "reload", structural: true, local: false } satisfies Change);
      return;
    }
    for (const r of rows) {
      const patch = (typeof r.patch === "string" ? JSON.parse(r.patch) : r.patch) as Patch;
      applyPatch(this.db, patch);
      this.seq = Number(r.seq);
      this.events.emit("change", { patch, actorId: r.actor_id, command: r.command, structural: r.structural, local: false } satisfies Change);
    }
  }

  private async writeAll(q: Pick<Sql, "query">, db: Database) {
    await q.query("DELETE FROM records");
    for (const name of COLLECTIONS) for (const x of db[name] as unknown as Record<string, unknown>[]) {
      await q.query("INSERT INTO records (collection, id, institution_id, data) VALUES ($1, $2, $3, $4)", [name, x.id, institutionOf(db, name, x), JSON.stringify(x)]);
    }
  }

  /** Butun bazani almashtirish (demo yoki import): boshqa nusxalar qayta yuklaydi. */
  async replaceAll(db: Database) {
    await this.serial(() => this.sql.tx(async (q) => {
      await q.query("SELECT pg_advisory_xact_lock($1)", [WRITE_LOCK]);
      await this.writeAll(q, db);
      // Boshqa nusxalar uchun "reload" belgisi: ular bazani to'liq qayta yuklaydi
      await q.query("DELETE FROM patch_log");
      const [r] = await q.query<{ seq: string | number }>("INSERT INTO patch_log (patch, command, structural) VALUES ('{}'::jsonb, 'reload', true) RETURNING seq");
      await this.cluster.publish({ t: "patch", seq: Number(r.seq) }, q);
    }));
    await this.load();
  }

  /** Shu nusxa ichida ketma-ketlik. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /**
   * Yozish: klaster bo'yicha qulf → boshqa nusxalar o'zgarishlarini qo'llash → buyruq →
   * saqlash + patch_log + NOTIFY (bitta tranzaksiyada) → xotira.
   */
  private write(command: string, actorId: string | null, structural: boolean, make: (db: Database) => Patch): Promise<Patch> {
    return this.serial(async () => {
      const { patch, seq } = await this.sql.tx(async (q) => {
        await q.query("SELECT pg_advisory_xact_lock($1)", [WRITE_LOCK]);
        await this.applyPending(q);
        const patch = make(this.db);
        if (!patch.upsert && !patch.remove) return { patch, seq: 0 };
        await this.persist(q, patch);
        const [r] = await q.query<{ seq: string | number }>(
          "INSERT INTO patch_log (patch, actor_id, command, structural) VALUES ($1, $2, $3, $4) RETURNING seq",
          [JSON.stringify(patch), actorId, command, structural],
        );
        await this.cluster.publish({ t: "patch", seq: Number(r.seq) }, q);
        return { patch, seq: Number(r.seq) };
      });
      if (!seq) return patch;
      applyPatch(this.db, patch);
      this.seq = seq;
      this.events.emit("change", { patch, actorId, command, structural, local: true } satisfies Change);
      return patch;
    });
  }

  /** Buyruqni bajarish: tekshiruv, saqlash, xotiraga qo'llash, tarqatish. */
  run<K extends CommandName>(actor: AppUser, name: K, input: CommandMap[K]): Promise<Patch> {
    return this.write(name, actor.id, STRUCTURAL_COMMANDS.includes(name), (db) => executeCommand(db, actor, name, input, this.clock()));
  }

  /** Tizim o'zgarishi (to'lov tizimidan kelgan tasdiq va h.k.). */
  applySystem(command: string, make: (db: Database) => Patch): Promise<Patch> {
    return this.write(command, null, false, make);
  }

  private async persist(q: Pick<Sql, "query">, patch: Patch) {
    const preview = emptyDatabase();
    // institutionOf yangi o'quvchilarni ham topishi uchun: joriy + patchdagi o'quvchilar.
    preview.students = [...this.db.students, ...(patch.upsert?.students ?? [])];
    preview.classes = [...this.db.classes, ...(patch.upsert?.classes ?? [])];
    {
      for (const [name, items] of Object.entries(patch.upsert ?? {}) as unknown as [CollectionName, Record<string, unknown>[]][]) {
        for (const x of items) {
          await q.query(
            `INSERT INTO records (collection, id, institution_id, data) VALUES ($1, $2, $3, $4)
             ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, institution_id = EXCLUDED.institution_id, updated_at = now()`,
            [name, x.id, institutionOf(preview, name, x), JSON.stringify(x)],
          );
        }
      }
      for (const [name, ids] of Object.entries(patch.remove ?? {}) as [CollectionName, string[]][]) {
        if (ids.length) await q.query("DELETE FROM records WHERE collection = $1 AND id = ANY($2::text[])", [name, ids]);
      }
    }
  }

  user(id: string): AppUser | undefined {
    return this.db.users.find((u) => u.id === id);
  }

  /** Faol foydalanuvchi va muassasasi bloklanmagan. */
  activeUser(id: string): AppUser {
    const u = this.user(id);
    if (!u || !u.active) throw new CommandError("err.forbidden", {}, 401);
    const inst = u.institutionId ? this.db.institutions.find((i) => i.id === u.institutionId) : undefined;
    if (inst && !inst.active) throw new CommandError("err.institutionBlocked", {}, 403);
    return u;
  }
}
