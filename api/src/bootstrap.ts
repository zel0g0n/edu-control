import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";

import { AppModule } from "./app.module";
import type { Config } from "./config";
import type { Sql } from "./db/sql";
import { ErrorsFilter } from "./errors.filter";

export async function createApp(config: Config, sql: Sql, logger: ("error" | "warn" | "log")[] = ["error", "warn", "log"]) {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.create(config, sql), { logger });
  app.useBodyParser("json", { limit: "6mb" });
  // Click so'rovlari application/x-www-form-urlencoded.
  app.useBodyParser("urlencoded", { extended: false, limit: "100kb" });
  app.enableCors({ origin: config.webOrigin, credentials: false, methods: ["GET", "POST"], allowedHeaders: ["Content-Type", "Authorization"] });
  app.useGlobalFilters(new ErrorsFilter());
  app.disable("x-powered-by");
  app.enableShutdownHooks();
  return app;
}
