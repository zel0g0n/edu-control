// Birinchi super adminni yaratish (bo'sh bazada demo ishlatmasdan ishga tushirish uchun).
// Ishlatish: DATABASE_URL=... npm run create-admin -w api -- 998901234567 "Ism Familiya"
import "reflect-metadata";
import { generatePassword, newId, normalizePhone } from "@edunazorat/shared";

import { hashPassword } from "../auth/credentials.service";

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
  const existing = await sql.query<{ id: string; role: string }>("SELECT id, data->>'role' AS role FROM records WHERE collection = 'users' AND data->>'phone' = $1", [phone]);
  const password = generatePassword("superAdmin");
  const saveCred = (userId: string) => hashPassword(password).then((h) => sql.query(
    `INSERT INTO credentials (user_id, hash, must_change, token_ver) VALUES ($1, $2, true, 0)
     ON CONFLICT (user_id) DO UPDATE SET hash = EXCLUDED.hash, must_change = true, token_ver = credentials.token_ver + 1, updated_at = now()`, [userId, h]));
  if (existing.length) {
    // Super admin parolini unutgan bo'lsa: shu buyruq bilan yangi parol
    if (existing[0].role !== "superAdmin") {
      console.error("Bu raqam allaqachon tizimda bor (boshqa rolda).");
      process.exit(1);
    }
    await saveCred(existing[0].id);
    console.log(`Super admin uchun yangi parol.\n  Login:  +${phone}\n  Parol:  ${password}\nKirgach parolni almashtiring. Serverni qayta ishga tushiring.`);
    await sql.close();
    return;
  }
  const user = { id: newId("u"), name, phone, role: "superAdmin", subjects: [], childIds: [], active: true };
  await sql.query("INSERT INTO records (collection, id, institution_id, data) VALUES ('users', $1, NULL, $2)", [user.id, JSON.stringify(user)]);
  await saveCred(user.id);
  console.log(`Super admin yaratildi: ${name}\n  Login:  +${phone}\n  Parol:  ${password}\nKirgach parolni almashtiring. Serverni qayta ishga tushiring.`);
  await sql.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
