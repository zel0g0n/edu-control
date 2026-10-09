import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventEmitter } from "node:events";
import {
  CommandError, STRUCTURAL_COMMANDS, applyPatch, emptyDatabase, executeCommand, seedDatabase,
  type AppUser, type CollectionName, type CommandMap, type CommandName, type Database, type Patch,
} from "@edunazorat/shared";

import { CONFIG, type Config } from "./config";
import { migrate } from "./db/schema";
import { SQL, type Sql } from "./db/sql";

const COLLECTIONS: CollectionName[] = [
  "institutions", "users", "classes", "students", "lessons", "terms", "grades", "attendance",
  "homeworks", "submissions", "invoices", "threads", "messages", "notifications",
];

export interface Change {
  patch: Patch;
  actorId: string | null;
  command: string;
  structural: boolean;
}

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
 * Buyruqlar ketma-ket bajariladi: bitta jarayon uchun mo'ljallangan
 * (maktab serveri yoki bitta bulut nusxasi).
 */
@Injectable()
export class StoreService implements OnModuleInit {
  private readonly log = new Logger("Store");
  db: Database = emptyDatabase();
  readonly events = new EventEmitter();
  private queue: Promise<unknown> = Promise.resolve();
  clock: () => number = () => Date.now();

  constructor(@Inject(SQL) private readonly sql: Sql, @Inject(CONFIG) private readonly config: Config) {
    this.events.setMaxListeners(0);
  }

  async onModuleInit() {
    await migrate(this.sql);
    await this.load();
    if (this.db.users.length === 0 && this.config.seedDemo) {
      this.log.warn("Baza bo'sh: demo ma'lumotlar yozilmoqda (SEED_DEMO=true)");
      await this.replaceAll(seedDatabase(this.clock()));
    }
    this.log.log(`Yuklandi: ${this.db.institutions.length} muassasa, ${this.db.users.length} foydalanuvchi, ${this.db.attendance.length} davomat yozuvi`);
  }

  async load() {
    const rows = await this.sql.query<{ collection: CollectionName; data: unknown }>("SELECT collection, data FROM records");
    const db = emptyDatabase();
    for (const r of rows) {
      const list = db[r.collection] as unknown[] | undefined;
      if (Array.isArray(list)) list.push(typeof r.data === "string" ? JSON.parse(r.data) : r.data);
    }
    this.db = db;
  }

  /** Butun bazani almashtirish (demo yoki import). */
  async replaceAll(db: Database) {
    await this.sql.tx(async (q) => {
      await q.query("DELETE FROM records");
      for (const name of COLLECTIONS) for (const x of db[name] as unknown as Record<string, unknown>[]) {
        await q.query("INSERT INTO records (collection, id, institution_id, data) VALUES ($1, $2, $3, $4)", [name, x.id, institutionOf(db, name, x), JSON.stringify(x)]);
      }
    });
    this.db = db;
  }

  /** Ketma-ketlik: bir vaqtda bitta o'zgartirish. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Buyruqni bajarish: tekshiruv, saqlash, xotiraga qo'llash, tarqatish. */
  run<K extends CommandName>(actor: AppUser, name: K, input: CommandMap[K]): Promise<Patch> {
    return this.serial(async () => {
      const patch = executeCommand(this.db, actor, name, input, this.clock());
      await this.persist(patch);
      applyPatch(this.db, patch);
      this.events.emit("change", { patch, actorId: actor.id, command: name, structural: STRUCTURAL_COMMANDS.includes(name) } satisfies Change);
      return patch;
    });
  }

  /** Tizim o'zgarishi (to'lov tizimidan kelgan tasdiq va h.k.). */
  applySystem(command: string, make: (db: Database) => Patch): Promise<Patch> {
    return this.serial(async () => {
      const patch = make(this.db);
      await this.persist(patch);
      applyPatch(this.db, patch);
      this.events.emit("change", { patch, actorId: null, command, structural: false } satisfies Change);
      return patch;
    });
  }

  private async persist(patch: Patch) {
    const preview = emptyDatabase();
    // institutionOf yangi o'quvchilarni ham topishi uchun: joriy + patchdagi o'quvchilar.
    preview.students = [...this.db.students, ...(patch.upsert?.students ?? [])];
    preview.classes = [...this.db.classes, ...(patch.upsert?.classes ?? [])];
    await this.sql.tx(async (q) => {
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
    });
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
