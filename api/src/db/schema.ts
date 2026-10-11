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
  // Parollar: faqat scrypt xeshi; records jadvalidan alohida, mijozga hech qachon yuborilmaydi
  `CREATE TABLE IF NOT EXISTS credentials (
     user_id text PRIMARY KEY,
     hash text NOT NULL,
     must_change boolean NOT NULL DEFAULT true,
     token_ver integer NOT NULL DEFAULT 0,
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  // Sessiyalar: token o'g'irlansa yoki qurilma yo'qolsa bekor qilish uchun
  `CREATE TABLE IF NOT EXISTS sessions (
     id text PRIMARY KEY,
     user_id text NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now(),
     last_seen timestamptz NOT NULL DEFAULT now(),
     revoked_at timestamptz,
     agent text NOT NULL DEFAULT '',
     ip text NOT NULL DEFAULT ''
   )`,
  `CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id)`,
  // Refresh token (faqat xeshi): har yangilanishda almashadi
  `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS refresh_hash text`,
  `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS prev_hash text`,
  `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS rotated_at timestamptz`,
  // Faoliyat jurnali: faqat qo'shiladi
  `CREATE TABLE IF NOT EXISTS audit_log (
     id bigserial PRIMARY KEY,
     at timestamptz NOT NULL DEFAULT now(),
     actor_id text,
     actor_role text,
     institution_id text,
     action text NOT NULL,
     target text,
     details jsonb NOT NULL DEFAULT '{}'::jsonb,
     ip text
   )`,
  `CREATE INDEX IF NOT EXISTS audit_inst ON audit_log (institution_id, id DESC)`,
  // Real vaqt ulanishi chiptalari (bir martalik, 60 soniya; faqat xeshi)
  `CREATE TABLE IF NOT EXISTS event_tickets (
     id text PRIMARY KEY,
     user_id text NOT NULL,
     sid text NOT NULL,
     exp timestamptz NOT NULL
   )`,
  // So'rov cheklovlari va xato urinishlar (barcha nusxalar uchun umumiy)
  `CREATE TABLE IF NOT EXISTS rate_limits (
     key text PRIMARY KEY,
     reset_at timestamptz NOT NULL,
     n integer NOT NULL DEFAULT 0,
     amount bigint NOT NULL DEFAULT 0
   )`,
  // SMS kirish kodlari (faqat xeshi)
  `CREATE TABLE IF NOT EXISTS otp_codes (
     phone text PRIMARY KEY,
     hash text NOT NULL,
     expires_at timestamptz NOT NULL,
     attempts integer NOT NULL DEFAULT 0,
     sent_at timestamptz NOT NULL DEFAULT now()
   )`,
  // Server nusxalarini sinxronlash: har o'zgarish tartib raqami bilan (2 kundan keyin tozalanadi)
  `CREATE TABLE IF NOT EXISTS patch_log (
     seq bigserial PRIMARY KEY,
     at timestamptz NOT NULL DEFAULT now(),
     patch jsonb NOT NULL,
     actor_id text,
     command text NOT NULL,
     structural boolean NOT NULL DEFAULT false
   )`,
  // Ikki bosqichli kirish: kalit shifrlangan, zaxira kodlar xesh
  `CREATE TABLE IF NOT EXISTS mfa (
     user_id text PRIMARY KEY,
     secret_enc text NOT NULL,
     enabled boolean NOT NULL DEFAULT false,
     backup jsonb NOT NULL DEFAULT '[]'::jsonb,
     last_step bigint NOT NULL DEFAULT -1,
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
];

/** Bir nechta nusxa bir vaqtda ishga tushsa ham migratsiyalar navbat bilan (Postgres advisory lock). */
export async function migrate(sql: Sql) {
  await sql.tx(async (q) => {
    await q.query("SELECT pg_advisory_xact_lock(724000)");
    for (const m of MIGRATIONS) await q.query(m);
  });
}
