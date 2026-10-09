// Demo ma'lumotlarni bazaga yozish (MAVJUD MA'LUMOTLAR O'CHADI!).
// Ishlatish: DATABASE_URL=... npm run seed -w api -- --yes
import "reflect-metadata";
import { emptyDatabase, seedDatabase } from "@edunazorat/shared";

import { loadConfig } from "../config";
import { migrate } from "../db/schema";
import { connect } from "../db/sql";
import { StoreService } from "../store.service";

async function main() {
  if (!process.argv.includes("--yes")) {
    console.error("Diqqat: bazadagi barcha ma'lumotlar demo bilan almashtiriladi. Tasdiqlash uchun --yes qo'shing.");
    process.exit(1);
  }
  const config = loadConfig();
  const sql = await connect(config.databaseUrl);
  await migrate(sql);
  const store = new StoreService(sql, config);
  store.db = emptyDatabase();
  await store.replaceAll(seedDatabase(Date.now()));
  console.log("Demo ma'lumotlar yozildi. Kirish: 998905555555 (ota-ona), 998903333333 (o'qituvchi), 998901111111 (direktor), 998900000000 (super admin)");
  await sql.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
