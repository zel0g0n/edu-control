import { Logger } from "@nestjs/common";

import { createApp } from "./bootstrap";
import { loadConfig, productionProblems } from "./config";
import { connect } from "./db/sql";

async function main() {
  const config = loadConfig();
  const sql = await connect(config.databaseUrl);
  const app = await createApp(config, sql);
  await app.listen(config.port, "0.0.0.0");
  const log = new Logger("EduNazorat");
  log.log(`API: http://localhost:${config.port}  (baza: ${config.databaseUrl.replace(/\/\/[^@]*@/, "//***@")})`);
  log.log(`Ruxsat berilgan sayt manzillari (WEB_ORIGIN): ${config.webOrigin.join(", ")}`);
  if (config.appEnv === "pilot") {
    for (const p of productionProblems(config)) log.warn(`Sinov rejimi: ${p}`);
    log.warn("Haqiqiy o'quvchilar ma'lumoti uchun APP_ENV=production qo'ying (SECURITY.md)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
