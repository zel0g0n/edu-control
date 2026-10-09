import type { Sql } from "./sql";

/**
 * Jadval tuzilmasi. Domen yozuvlari (o'quvchi, baho, davomat...) "records"
 * jadvalida JSONB sifatida: tuzilma shared/types.ts da, buyruqlar mantig'i
 * shared/server.ts da bir joyda, web demo bilan bir xil.
 */
export const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS records (
     collection text NOT NULL,
     id text NOT NULL,
     institution_id text,
     data jsonb NOT NULL,
     updated_at timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (collection, id)
   )`,
  `CREATE INDEX IF NOT EXISTS records_inst ON records (institution_id)`,
  `CREATE TABLE IF NOT EXISTS files (
     id text PRIMARY KEY,
     owner_id text NOT NULL,
     name text NOT NULL,
     type text NOT NULL,
     size integer NOT NULL,
     data bytea NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS push_subscriptions (
     endpoint text PRIMARY KEY,
     user_id text NOT NULL,
     lang text NOT NULL DEFAULT 'uz',
     data jsonb NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS push_user ON push_subscriptions (user_id)`,
  `CREATE TABLE IF NOT EXISTS payme_transactions (
     id text PRIMARY KEY,
     invoice_id text NOT NULL,
     amount bigint NOT NULL,
     state integer NOT NULL,
     create_time bigint NOT NULL,
     perform_time bigint NOT NULL DEFAULT 0,
     cancel_time bigint NOT NULL DEFAULT 0,
     reason integer
   )`,
  `CREATE TABLE IF NOT EXISTS click_transactions (
     click_trans_id text PRIMARY KEY,
     invoice_id text NOT NULL,
     amount bigint NOT NULL,
     state text NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
];

export async function migrate(sql: Sql) {
  for (const m of MIGRATIONS) await sql.query(m);
}
