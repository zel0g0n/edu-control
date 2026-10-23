import { Body, CanActivate, Controller, ExecutionContext, Get, HttpCode, Inject, Injectable, Logger, Post, UseGuards, createParamDecorator } from "@nestjs/common";
import type { Request } from "express";
import { createHash } from "node:crypto";
import {
  CommandError, ZAMS_API_VERSION, ZAMS_KEY_PATTERN, dayKey, zamsLessonPatch, zamsRosterPatch,
  type Institution, type ZamsLessonInput, type ZamsLessonResult, type ZamsRosterInput, type ZamsRosterResult,
} from "@edunazorat/shared";

import { CONFIG, type Config } from "./config";
import { LimitsService } from "./limits.service";
import { findNvrInstitution } from "./nvr.controller";
import { StoreService } from "./store.service";

const WINDOW_S = 10 * 60;
/** Z_AMS serveri javob bermasa, oxirgi "ruxsat bor" natija shuncha vaqt amal qiladi. */
const STALE_OK_MS = 24 * 3_600_000;
/** "Ruxsat yo'q" javobi qisqa keshlanadi: admin yoqsa tez ishlasin. */
const DENY_TTL_MS = 60_000;

export interface ZamsVerdict {
  allowed: boolean;
  reason?: string;
  schoolId?: number;
  schoolName?: string;
}

/**
 * Z_AMS admin serveridan "shu maktabga EduNazorat ulanishi ruxsat etilganmi" so'raydi.
 * Natija keshlanadi (Z_AMS aytgan ttl_seconds, ko'pi bilan 10 daqiqa); server ishlamay qolsa,
 * oxirgi ijobiy natijadan 24 soatgacha foydalaniladi, keyin rad etiladi.
 */
@Injectable()
export class ZamsVerifyService {
  private readonly log = new Logger("Z_AMS");
  private readonly cache = new Map<string, { v: ZamsVerdict; at: number; ttl: number }>();
  /** Testlarda almashtiriladi. */
  fetcher: typeof fetch = (...a) => fetch(...a);

  constructor(@Inject(CONFIG) private readonly config: Config) {}

  get enabled(): boolean {
    return !!(this.config.zamsVerifyUrl && this.config.zamsServiceKey);
  }

  async verify(token: string, now = Date.now()): Promise<ZamsVerdict> {
    const k = createHash("sha256").update(token).digest("hex");
    const hit = this.cache.get(k);
    if (hit && now - hit.at < hit.ttl) return hit.v;
    let v: ZamsVerdict;
    let ttl: number;
    try {
      const r = await this.fetcher(this.config.zamsVerifyUrl!, {
        headers: { "X-Service-Key": this.config.zamsServiceKey!, "X-Edu-Token": token },
        signal: AbortSignal.timeout(6000),
      });
      if (r.status === 401) {
        this.log.error("Z_AMS serveri xizmat kalitini rad etdi (ZAMS_SERVICE_KEY mos emas)");
        throw new Error("service key");
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { allowed?: boolean; reason?: string; school_id?: number; school_name?: string; ttl_seconds?: number };
      v = { allowed: j.allowed === true, reason: j.reason, schoolId: typeof j.school_id === "number" ? j.school_id : undefined, schoolName: j.school_name };
      if (v.allowed && !v.schoolId) v = { allowed: false, reason: "bad_response" };
      ttl = v.allowed ? Math.min(Math.max(Number(j.ttl_seconds) || 300, 30), 600) * 1000 : DENY_TTL_MS;
    } catch (e) {
      if (hit?.v.allowed && now - hit.at < STALE_OK_MS) {
        this.log.warn(`Z_AMS tekshiruvi ishlamadi (${e}), oxirgi natija ishlatildi`);
        return hit.v;
      }
      throw new CommandError("err.zamsUnavailable", {}, 503);
    }
    this.cache.set(k, { v, at: now, ttl });
    if (this.cache.size > 5000) this.cache.delete(this.cache.keys().next().value!);
    return v;
  }
}

type ZamsRequest = Request & { zams?: { inst: Institution; schoolId: number; schoolName?: string } };

/**
 * Ikki kalit: "Authorization: Bearer edn_..." (qaysi EduNazorat muassasasi, direktor yaratadi) va
 * "X-Zams-Key: zedu_..." (Z_AMS admin paneli bergan ruxsat). Muassasa birinchi ulanishda Z_AMS maktabiga
 * bog'lanadi; keyin boshqa maktab kaliti bilan kirib bo'lmaydi.
 */
@Injectable()
export class ZamsGuard implements CanActivate {
  constructor(
    @Inject(StoreService) private readonly store: StoreService,
    @Inject(LimitsService) private readonly limits: LimitsService,
    @Inject(ZamsVerifyService) private readonly verifier: ZamsVerifyService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<ZamsRequest>();
    if (!this.verifier.enabled) throw new CommandError("err.zamsDisabled", {}, 503);
    const ip = req.ip ?? "?";
    if ((await this.limits.peek(`zamsfail:${ip}`)).n >= 20) throw new CommandError("err.tooMany", {}, 429);
    const fail = async (key: string, status: number) => {
      await this.limits.hit(`zamsfail:${ip}`, WINDOW_S);
      return new CommandError(key, {}, status);
    };
    const h = req.headers.authorization;
    const ednKey = h?.startsWith("Bearer ") ? h.slice(7).trim() : "";
    const inst = findNvrInstitution(this.store.db.institutions, ednKey);
    if (!inst) throw await fail("err.nvrKey", 401);
    if (!inst.active) throw new CommandError("err.institutionBlocked", {}, 403);
    const zedu = String(req.headers["x-zams-key"] ?? "").trim();
    if (!ZAMS_KEY_PATTERN.test(zedu)) throw await fail("err.zamsKey", 401);
    const v = await this.verifier.verify(zedu);
    if (!v.allowed) {
      if (v.reason === "unknown_key") throw await fail("err.zamsKey", 401);
      throw new CommandError("err.zamsNotAllowed", { reason: v.reason ?? "" }, 403);
    }
    const linked = inst.settings.zams?.schoolId;
    if (linked !== undefined && linked !== v.schoolId) throw new CommandError("err.zamsOtherSchool", {}, 403);
    req.zams = { inst, schoolId: v.schoolId!, schoolName: v.schoolName };
    return true;
  }
}

const Zams = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<ZamsRequest>().zams!);

/** Z_AMS ulanishi API (hujjat: ZAMS.md). */
@Controller(`integrations/zams/${ZAMS_API_VERSION}`)
@UseGuards(ZamsGuard)
export class ZamsController {
  constructor(@Inject(StoreService) private readonly store: StoreService) {}

  /** Muassasaning eng yangi holati (guard ko'rgan nusxa eskirgan bo'lishi mumkin). */
  private fresh(id: string, db = this.store.db): Institution {
    return db.institutions.find((i) => i.id === id)!;
  }

  @Get("ping")
  async ping(@Zams() z: ZamsRequest["zams"] & object) {
    // Birinchi muvaffaqiyatli ulanish: muassasa shu Z_AMS maktabiga bog'lanadi
    if (!z.inst.settings.zams) {
      await this.store.applySystem("zams.link", (db) => {
        const inst = this.fresh(z.inst.id, db);
        if (inst.settings.zams) return {};
        return { upsert: { institutions: [{ ...inst, settings: { ...inst.settings, zams: { schoolId: z.schoolId, schoolName: z.schoolName, linkedAt: this.store.clock() } } }] } };
      });
    }
    const inst = this.fresh(z.inst.id);
    return {
      ok: true, version: ZAMS_API_VERSION, institution: { id: inst.id, name: inst.name },
      zams: { schoolId: z.schoolId }, serverTime: this.store.clock(), today: dayKey(this.store.clock()),
      students: this.store.db.students.filter((s) => s.institutionId === inst.id && !s.archived).length,
    };
  }

  @Post("roster")
  @HttpCode(200)
  async roster(@Zams() z: ZamsRequest["zams"] & object, @Body() body: ZamsRosterInput): Promise<ZamsRosterResult> {
    let result!: ZamsRosterResult;
    await this.store.applySystem("zams.roster", (db) => {
      const r = zamsRosterPatch(db, this.fresh(z.inst.id, db), z.schoolId, body, this.store.clock());
      result = r.result;
      return r.patch;
    });
    return result;
  }

  @Post("lesson")
  @HttpCode(200)
  async lesson(@Zams() z: ZamsRequest["zams"] & object, @Body() body: ZamsLessonInput): Promise<ZamsLessonResult> {
    let result!: ZamsLessonResult;
    const now = this.store.clock();
    await this.store.applySystem("zams.lesson", (db) => {
      const r = zamsLessonPatch(db, this.fresh(z.inst.id, db), z.schoolId, body, now, dayKey(now));
      result = r.result;
      return r.patch;
    });
    return result;
  }
}
