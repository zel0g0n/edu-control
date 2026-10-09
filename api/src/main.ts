import { Logger } from "@nestjs/common";

import { createApp } from "./bootstrap";
import { loadConfig } from "./config";
import { connect } from "./db/sql";

async function main() {
  const config = loadConfig();
  const sql = await connect(config.databaseUrl);
  const app = await createApp(config, sql);
  await app.listen(config.port, "0.0.0.0");
  const log = new Logger("EduNazorat");
  log.log(`API: http://localhost:${config.port}  (baza: ${config.databaseUrl.replace(/\/\/[^@]*@/, "//***@")})`);
  if (config.smsDevMode) log.warn("SMS_DEV_MODE: SMS yuborilmaydi, kod javobda qaytadi. Ishlab chiqarishda o'chiring!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
