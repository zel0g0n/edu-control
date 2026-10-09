// Postgres ulanishi: haqiqiy server (pg) yoki o'rnatishsiz PGlite (WASM Postgres).
export interface Row { [k: string]: unknown }
export interface Sql {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
  /** Tranzaksiya: hammasi yoki hech narsa. */
  tx<T>(fn: (q: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function connect(url: string): Promise<Sql> {
  if (url.startsWith("pglite:") || url === "memory:") {
    const { PGlite } = await import("@electric-sql/pglite");
    const dir = url === "memory:" || url === "pglite:memory" ? undefined : url.slice("pglite:".length);
    if (dir) await import("node:fs").then((fs) => fs.mkdirSync(dir, { recursive: true }));
    const db = dir ? new PGlite(dir) : new PGlite();
    await db.waitReady;
    const wrap = (q: { query: typeof db.query }): Sql => ({
      async query<T>(text: string, params: unknown[] = []) {
        return (await q.query<T>(text, params as never[])).rows;
      },
      tx: (fn) => db.transaction((t) => fn(wrap(t as never))) as never,
      close: async () => undefined,
    });
    const sql = wrap(db);
    return { ...sql, close: () => db.close() };
  }
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url, max: 5, ssl: /sslmode=require|neon\.tech/.test(url) ? { rejectUnauthorized: true } : undefined });
  const viaClient = (c: { query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }): Sql => ({
    async query<T>(text: string, params: unknown[] = []) {
      return (await c.query(text, params)).rows as T[];
    },
    tx: () => {
      throw new Error("ichki tranzaksiya qo'llanmaydi");
    },
    close: async () => undefined,
  });
  return {
    ...viaClient(pool),
    async tx<T>(fn: (q: Sql) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const r = await fn(viaClient(client));
        await client.query("COMMIT");
        return r;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

export const SQL = Symbol("SQL");
