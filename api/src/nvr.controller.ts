import { Body, CanActivate, Controller, ExecutionContext, Get, HttpCode, Inject, Injectable, Post, Query, UseGuards, createParamDecorator } from "@nestjs/common";
import type { Request } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  CommandError, NVR_API_VERSION, NVR_KEY_PATTERN, dayKey, nvrAttendancePatch, nvrRoster, nvrSchedule,
  type Institution, type NvrAttendanceInput, type NvrAttendanceResult,
} from "@edunazorat/shared";

import { StoreService } from "./store.service";

const sha256 = (s: string) => createHash("sha256").update(s).digest();

/** Kalitni taxmin qilishga urinishlarni cheklash: bitta IP dan 10 daqiqada 20 ta xato. */
const failures = new Map<string, { n: number; until: number }>();
const WINDOW = 10 * 60_000;

/**
 * NVR so'rovlari: "Authorization: Bearer edn_..." (yoki "X-Api-Key").
 * Kalit muassasaga tegishli; serverda faqat SHA-256 xeshi saqlanadi.
 */
@Injectable()
export class NvrKeyGuard implements CanActivate {
  constructor(@Inject(StoreService) private readonly store: StoreService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request & { nvrInstitution?: Institution }>();
    const ip = req.ip ?? "?";
    const f = failures.get(ip);
    if (f && f.n >= 20 && f.until > Date.now()) throw new CommandError("err.tooMany", {}, 429);
    const h = req.headers.authorization;
    const key = h?.startsWith("Bearer ") ? h.slice(7).trim() : String(req.headers["x-api-key"] ?? "").trim();
    const inst = NVR_KEY_PATTERN.test(key) ? this.find(key) : undefined;
    if (!inst) {
      const cur = f && f.until > Date.now() ? f : { n: 0, until: Date.now() + WINDOW };
      failures.set(ip, { n: cur.n + 1, until: cur.until });
      throw new CommandError("err.nvrKey", {}, 401);
    }
    if (!inst.active) throw new CommandError("err.institutionBlocked", {}, 403);
    failures.delete(ip);
    req.nvrInstitution = inst;
    return true;
  }

  private find(key: string): Institution | undefined {
    const digest = sha256(key);
    return this.store.db.institutions.find((i) => {
      const n = i.settings.nvr;
      if (!n?.enabled || !n.keyHash) return false;
      const stored = Buffer.from(n.keyHash, "hex");
      return stored.length === digest.length && timingSafeEqual(stored, digest);
    });
  }
}

const NvrInstitution = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<{ nvrInstitution: Institution }>().nvrInstitution);

/** NVR integratsiyasi API (hujjat: INTEGRATSIYA.md). */
@Controller(`integrations/nvr/${NVR_API_VERSION}`)
@UseGuards(NvrKeyGuard)
export class NvrController {
  constructor(@Inject(StoreService) private readonly store: StoreService) {}

  @Get("ping")
  ping(@NvrInstitution() inst: Institution) {
    return { ok: true, version: NVR_API_VERSION, institution: { id: inst.id, name: inst.name }, serverTime: this.store.clock(), today: dayKey(this.store.clock()) };
  }

  @Get("roster")
  roster(@NvrInstitution() inst: Institution) {
    return nvrRoster(this.store.db, inst);
  }

  @Get("schedule")
  schedule(@NvrInstitution() inst: Institution, @Query("day") day?: string) {
    const d = day ?? dayKey(this.store.clock());
    return { day: d, lessons: nvrSchedule(this.store.db, inst, d) };
  }

  @Post("attendance")
  @HttpCode(200)
  async attendance(@NvrInstitution() inst: Institution, @Body() body: NvrAttendanceInput): Promise<NvrAttendanceResult> {
    let result: NvrAttendanceResult = { applied: 0, skipped: [] };
    await this.store.applySystem("attendance.nvr", (db) => {
      const r = nvrAttendancePatch(db, inst, body, this.store.clock());
      result = r.result;
      return r.patch;
    });
    return result;
  }
}
