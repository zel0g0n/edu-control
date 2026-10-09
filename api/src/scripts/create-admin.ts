// Birinchi super adminni yaratish (bo'sh bazada demo ishlatmasdan ishga tushirish uchun).
// Ishlatish: DATABASE_URL=... npm run create-admin -w api -- 998901234567 "Ism Familiya"
import "reflect-metadata";
import { newId, normalizePhone } from "@edunazorat/shared";

import { loadConfig } from "../config";
import { migrate } from "../db/schema";
import { connect } from "../db/sql";

async function main() {
  const [, , rawPhone, ...nameParts] = process.argv;
  const phone = normalizePhone(rawPhone ?? "");
  const name = nameParts.join(" ").trim() || "Super admin";
  if (!phone) {
    console.error('Telefon raqam kerak: npm run create-admin -w api -- 998901234567 "Ism Familiya"');
    process.exit(1);
  }
  const sql = await connect(loadConfig().databaseUrl);
  await migrate(sql);
  const existing = await sql.query<{ id: string }>("SELECT id FROM records WHERE collection = 'users' AND data->>'phone' = $1", [phone]);
  if (existing.length) {
    console.error("Bu raqam allaqachon tizimda bor.");
    process.exit(1);
  }
  const user = { id: newId("u"), name, phone, role: "superAdmin", subjects: [], childIds: [], active: true };
  await sql.query("INSERT INTO records (collection, id, institution_id, data) VALUES ('users', $1, NULL, $2)", [user.id, JSON.stringify(user)]);
  console.log(`Super admin yaratildi: ${name}, +${phone}. Serverni qayta ishga tushiring.`);
  await sql.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
