import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import compression from "compression";
import type { NextFunction, Request, Response } from "express";
import { constants as zlib } from "node:zlib";

import { registerRussian, RU } from "@edunazorat/shared";

import { AppModule } from "./app.module";
import type { Config } from "./config";
import type { Sql } from "./db/sql";
import { ErrorsFilter } from "./errors.filter";

export async function createApp(config: Config, sql: Sql, logger: ("error" | "warn" | "log")[] = ["error", "warn", "log"]) {
  // Bildirishnoma matnlari (push) rus tilida ham
  registerRussian(RU);
  const app = await NestFactory.create<NestExpressApplication>(AppModule.create(config, sql), { logger });
  app.useBodyParser("json", { limit: "6mb" });
  // Click so'rovlari application/x-www-form-urlencoded.
  app.useBodyParser("urlencoded", { extended: false, limit: "100kb" });
  app.enableCors({ origin: config.webOrigin, credentials: config.authCookie, methods: ["GET", "POST"], allowedHeaders: ["Content-Type", "Authorization"], maxAge: 600 });
  app.useGlobalFilters(new ErrorsFilter());
  // Javoblarni siqish (brotli/gzip): bootstrap JSON 20-25 marta kichrayadi. Real vaqt oqimi (SSE) siqilmaydi:
  // aks holda xabarlar bufferda qolib kechikadi. Kichik javoblar (<1 KB) siqilmaydi.
  app.use(compression({
    threshold: 1024,
    level: 5,
    brotli: { params: { [zlib.BROTLI_PARAM_QUALITY]: 4 } },
    filter: (req, res) => req.path !== "/events" && compression.filter(req, res),
  }));
  app.disable("x-powered-by");
  // Xavfsizlik sarlavhalari: API faqat JSON beradi, sahifa sifatida ochilmaydi va boshqa saytga joylanmaydi
  const https = config.publicUrl.startsWith("https://");
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    if (https) res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
    // Shaxsiy ma'lumot oraliq keshlarda saqlanmasin (fayllar o'z sarlavhasini qo'yadi)
    if (!req.path.startsWith("/files/")) res.setHeader("Cache-Control", "no-store");
    next();
  });
  // Render/nginx ortida: haqiqiy mijoz IP manzili (so'rov cheklovi va jurnal uchun)
  app.set("trust proxy", config.trustProxy);
  app.enableShutdownHooks();
  return app;
}
