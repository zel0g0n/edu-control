import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { CommandError, attendanceBetween, bootstrapFor, canSeeStudent, packDatabase, packPatch, dayKey, findUserByLogin, linkedProfiles, scopeDatabase, scopePatch, type AppUser, type CommandMap, type CommandName, type Lang } from "@edunazorat/shared";

import { AllowMfaSetup, AuthGuard, CurrentSession, CurrentUser } from "./auth/auth.guard";
import { MfaService } from "./auth/mfa.service";
import { SessionService } from "./auth/session.service";
import { CredentialsService } from "./auth/credentials.service";
import { OtpService } from "./auth/otp.service";
import { ACCESS_TTL_S, TokenService } from "./auth/token.service";
import { CONFIG, type Config } from "./config";
import { SQL, type Sql } from "./db/sql";
import { AuditService } from "./audit.service";
import { LimitsService } from "./limits.service";
import { PaymentsService, type ClickRequest } from "./payments.service";
import { PushService } from "./push.service";
import { RealtimeService } from "./realtime.service";
import { SnapshotsService } from "./snapshots.service";
import { StoreService } from "./store.service";

const COMMANDS = new Set<string>([
  "attendance.mark", "grade.add", "grade.remove", "grade.setFinal", "homework.save", "homework.delete", "submission.submit",
  "submission.review", "invoice.generate", "invoice.adjust", "payment.add", "payment.remind", "message.send", "thread.read", "notification.read",
  "announcement.send", "consent.set", "face.enroll", "student.save", "student.archive", "teacher.save", "teacher.setActive",
  "class.save", "class.delete", "lesson.save", "lesson.delete", "term.save", "settings.save", "institution.save", "institution.setActive",
  "nvr.configure", "admin.save", "admin.setActive", "lead.save", "lead.update", "lead.convert", "lead.delete",
  "student.import", "student.photo",
  // "payment.demoOnline" serverda yo'q: haqiqiy to'lov faqat Click/Payme orqali.
] satisfies CommandName[]);

const MAX_FILE = 2 * 1024 * 1024;
const REFRESH_COOKIE = "edn_rt";
const FILE_ID_RE = /^[0-9a-f]{32}$/;
/** Imzolangan fayl havolasi muddati. */
const FILE_LINK_TTL_S = 15 * 60;

function readCookie(req: Request, name: string): string {
  for (const part of String(req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return "";
}

@Controller()
export class AppController {
  constructor(
    @Inject(StoreService) private readonly store: StoreService,
    @Inject(OtpService) private readonly otp: OtpService,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(LimitsService) private readonly limits: LimitsService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MfaService) private readonly mfa: MfaService,
    @Inject(CredentialsService) private readonly creds: CredentialsService,
    @Inject(RealtimeService) private readonly realtime: RealtimeService,
    @Inject(PushService) private readonly push: PushService,
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Inject(SQL) private readonly sql: Sql,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(SnapshotsService) private readonly snapshots: SnapshotsService,
  ) {}

  /**
   * Monitoring uchun: baza javob beradimi va ma'lumot yuklanganmi. Biror narsa ishlamasa — 503
   * (tools/ops/monitor.sh va .github/workflows/uptime.yml shuni tekshiradi). Ichki ma'lumot oshkor qilinmaydi.
   */
  @Get("health")
  async health(@Res({ passthrough: true }) res: Response) {
    let db = false;
    try {
      await Promise.race([this.sql.query("SELECT 1"), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000))]);
      db = true;
    } catch {
      db = false;
    }
    const ok = db && this.store.loaded;
    if (!ok) res.status(503);
    return { ok, db, ready: this.store.loaded, push: this.push.enabled };
  }

  // ------------------------------------------------------------ kirish

  @Post("auth/request-code")
  @HttpCode(200)
  async requestCode(@Body() b: { phone?: string }, @Req() req: Request) {
    await this.limits.otpRequest(req.ip ?? "");
    return this.otp.request(String(b?.phone ?? "").slice(0, 24));
  }

  @Post("auth/verify-code")
  @HttpCode(200)
  async verifyCode(@Body() b: { phone?: string; code?: string }, @Req() req: Request, @Res({ passthrough: true }) out: Response) {
    await this.limits.loginAttempt(req.ip ?? "");
    const u = await this.otp.verify(String(b?.phone ?? ""), String(b?.code ?? ""));
    if (this.mfa.enabled(u.id)) return { mfaRequired: true, mfaToken: this.tokens.signMfa(u.id, this.creds.tokenVersion(u.id)), userId: u.id };
    void this.audit.record({ actor: u, action: "auth.login", target: u.id, details: { method: "sms" }, ip: req.ip });
    return { ...(await this.issue(u.id, req, out)), userId: u.id, mfaSetupRequired: this.mfa.setupRequired(u) };
  }

  /**
   * Yangi sessiya: qisqa muddatli kirish tokeni (15 daqiqa, faqat xotirada) va refresh token.
   * Cookie rejimida refresh token httpOnly cookie'da (JavaScript ko'rmaydi), javobda yo'q.
   */
  private async issue(userId: string, req: Request, out: Response) {
    const { sid, refreshToken } = await this.sessions.create(userId, String(req.headers["user-agent"] ?? ""), req.ip ?? "");
    return this.tokensFor(userId, sid, refreshToken, out);
  }

  private tokensFor(userId: string, sid: string, refreshToken: string, out: Response) {
    const token = this.tokens.sign(userId, this.creds.tokenVersion(userId), sid);
    if (this.config.authCookie) {
      out.cookie(REFRESH_COOKIE, refreshToken, {
        httpOnly: true, secure: this.config.publicUrl.startsWith("https://"), sameSite: "strict", path: "/auth", maxAge: 90 * 86_400_000,
      });
      return { token, expiresIn: ACCESS_TTL_S };
    }
    return { token, expiresIn: ACCESS_TTL_S, refreshToken };
  }

  /** Kirish tokenini yangilash (refresh token almashadi). */
  @Post("auth/refresh")
  @HttpCode(200)
  async refresh(@Body() b: { refreshToken?: string }, @Req() req: Request, @Res({ passthrough: true }) out: Response) {
    // CSRF: faqat JSON so'rov (boshqa saytdan oddiy forma bilan yuborib bo'lmaydi) + SameSite=Strict cookie
    if (!req.is("application/json")) throw new CommandError("err.forbidden", {}, 403);
    await this.limits.loginAttempt(`rt:${req.ip ?? ""}`);
    const raw = this.config.authCookie ? readCookie(req, REFRESH_COOKIE) : typeof b?.refreshToken === "string" ? b.refreshToken : "";
    try {
      const r = await this.sessions.refresh(raw.slice(0, 200));
      this.store.activeUser(r.userId);
      return { ...this.tokensFor(r.userId, r.sid, r.refreshToken, out), userId: r.userId };
    } catch (e) {
      const reused = (e as { reused?: string }).reused;
      if (reused) {
        const u = this.store.user(reused);
        void this.audit.record({ actor: u, action: "auth.refreshReuse", target: reused, ip: req.ip });
      }
      if (e instanceof CommandError && e.status === 401 && this.config.authCookie) out.clearCookie(REFRESH_COOKIE, { path: "/auth" });
      throw e;
    }
  }

  /** Qaysi kirish usullari bor (SMS faqat Eskiz ulangan yoki sinov rejimida). */
  @Get("auth/methods")
  methods() {
    return { password: true, sms: this.config.smsDevMode || !!this.config.eskizEmail, cookie: this.config.authCookie };
  }

  @Post("auth/login")
  @HttpCode(200)
  async login(@Body() b: { login?: string; password?: string }, @Req() req: Request, @Res({ passthrough: true }) out: Response) {
    // Bir IP'dan ko'p loginlarga parol terish (har bir login alohida ham bloklanadi)
    await this.limits.loginAttempt(req.ip ?? "");
    const login = String(b?.login ?? "").slice(0, 100);
    let res: { user: AppUser; mustChange: boolean };
    try {
      res = await this.creds.login(login, String(b?.password ?? "").slice(0, 100));
    } catch (e) {
      // Muvaffaqiyatsiz urinish: login (parol emas) va IP yoziladi
      let known: AppUser | undefined;
      try { known = findUserByLogin(this.store.db, login); } catch { known = undefined; }
      void this.audit.record({ actor: null, institutionId: known?.institutionId, action: e instanceof CommandError && e.status === 429 ? "auth.loginBlocked" : "auth.loginFailed", target: known?.id, details: { login: login.slice(0, 40) }, ip: req.ip });
      throw e;
    }
    // Ikkinchi qadam: ilova kodi
    if (this.mfa.enabled(res.user.id)) {
      return { mfaRequired: true, mfaToken: this.tokens.signMfa(res.user.id, this.creds.tokenVersion(res.user.id)), userId: res.user.id, mustChange: res.mustChange };
    }
    void this.audit.record({ actor: res.user, action: "auth.login", target: res.user.id, details: { method: "password" }, ip: req.ip });
    return { ...(await this.issue(res.user.id, req, out)), userId: res.user.id, mustChange: res.mustChange, mfaSetupRequired: this.mfa.setupRequired(res.user) };
  }

  /** 2FA: parol to'g'ri bo'lgach ilova kodi (yoki zaxira kod). */
  @Post("auth/mfa/verify")
  @HttpCode(200)
  async mfaVerify(@Body() b: { mfaToken?: string; code?: string }, @Req() req: Request, @Res({ passthrough: true }) out: Response) {
    const { userId, version } = this.tokens.verifyMfa(String(b?.mfaToken ?? ""));
    if (version !== this.creds.tokenVersion(userId)) throw new CommandError("err.mfaExpired", {}, 401);
    // Kod terib topishga qarshi: foydalanuvchi bo'yicha 10 daqiqada 10 urinish
    await this.limits.mfaAttempt(userId);
    const u = this.store.activeUser(userId);
    const how = await this.mfa.verify(userId, String(b?.code ?? "").slice(0, 20));
    if (!how) {
      void this.audit.record({ actor: u, action: "auth.mfaFailed", target: u.id, ip: req.ip });
      throw new CommandError("err.mfaCode", {}, 401);
    }
    void this.audit.record({ actor: u, action: how === "backup" ? "auth.mfaBackupUsed" : "auth.login", target: u.id, details: { method: "2fa" }, ip: req.ip });
    return { ...(await this.issue(u.id, req, out)), userId: u.id };
  }

  @Get("auth/mfa/status")
  @UseGuards(AuthGuard)
  @AllowMfaSetup()
  mfaStatus(@CurrentUser() u: AppUser) {
    return this.mfa.status(u);
  }

  @Post("auth/mfa/setup")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @AllowMfaSetup()
  mfaSetup(@CurrentUser() u: AppUser) {
    return this.mfa.setup(u);
  }

  @Post("auth/mfa/enable")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @AllowMfaSetup()
  async mfaEnable(@CurrentUser() u: AppUser, @Body() b: { code?: string }, @Req() req: Request) {
    await this.limits.mfaAttempt(u.id);
    const r = await this.mfa.enable(u, String(b?.code ?? "").slice(0, 20));
    void this.audit.record({ actor: u, action: "auth.mfaEnabled", target: u.id, ip: req.ip });
    return r;
  }

  @Post("auth/mfa/disable")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async mfaDisable(@CurrentUser() u: AppUser, @Body() b: { code?: string }, @Req() req: Request) {
    await this.limits.mfaAttempt(u.id);
    await this.mfa.disable(u, String(b?.code ?? "").slice(0, 20));
    void this.audit.record({ actor: u, action: "auth.mfaDisabled", target: u.id, ip: req.ip });
    return { ok: true };
  }

  @Post("auth/mfa/backup-codes")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async mfaBackup(@CurrentUser() u: AppUser, @Body() b: { code?: string }) {
    await this.limits.mfaAttempt(u.id);
    return this.mfa.regenerateBackup(u, String(b?.code ?? "").slice(0, 20));
  }

  /** Yangi parol berish (administrator → o'qituvchi/o'quvchi/ota-ona, direktor → administrator). */
  @Post("auth/password/reset")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async resetPassword(@CurrentUser() u: AppUser, @Body() b: { userId?: string }, @Req() req: Request) {
    const r = await this.creds.reset(u, String(b?.userId ?? ""));
    const tu = this.store.user(String(b?.userId ?? ""));
    void this.audit.record({ actor: u, institutionId: u.institutionId ?? tu?.institutionId, action: "auth.passwordReset", target: tu?.id, details: { name: tu?.name ?? "" }, ip: req.ip });
    // Eski parol bilan ochilgan barcha qurilmalar chiqariladi
    const target = String(b?.userId ?? "");
    // Telefon yo'qolgan bo'lishi mumkin: 2FA qayta sozlanadi
    if (this.mfa.enabled(target)) await this.mfa.reset(target);
    await this.sessions.revokeAll(target);
    this.realtime.dropUser(target);
    return r;
  }

  @Post("auth/password/change")
  @AllowMfaSetup()
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async changePassword(@CurrentUser() u: AppUser, @CurrentSession() sid: string, @Body() b: { current?: string; next?: string }, @Req() req: Request) {
    await this.creds.change(u, String(b?.current ?? "").slice(0, 100), String(b?.next ?? "").slice(0, 100));
    void this.audit.record({ actor: u, action: "auth.passwordChange", target: u.id, ip: req.ip });
    // Parol almashsa boshqa qurilmalar chiqariladi, joriy qurilma qoladi
    await this.sessions.revokeAll(u.id, sid);
    this.realtime.dropUser(u.id, sid);
    return { ok: true };
  }

  @Post("auth/credentials/status")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  credentialStatus(@CurrentUser() u: AppUser, @Body() b: { ids?: unknown }) {
    const ids = Array.isArray(b?.ids) ? b.ids.map(String) : [];
    return this.creds.status(u, ids);
  }

  @Post("auth/sign-out")
  @AllowMfaSetup()
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async signOut(@CurrentUser() u: AppUser, @CurrentSession() sid: string, @Body() b: { endpoint?: string }, @Res({ passthrough: true }) out: Response) {
    await this.push.unsubscribeUser(u.id, typeof b?.endpoint === "string" ? b.endpoint : undefined);
    await this.sessions.revoke(sid);
    this.realtime.dropSession(sid);
    if (this.config.authCookie) out.clearCookie(REFRESH_COOKIE, { path: "/auth" });
  }

  /** Mening qurilmalarim (sessiyalar). */
  @Get("auth/sessions")
  @AllowMfaSetup()
  @UseGuards(AuthGuard)
  mySessions(@CurrentUser() u: AppUser, @CurrentSession() sid: string) {
    return this.sessions.list(u.id, sid);
  }

  /** Boshqa barcha qurilmalardan chiqish. */
  @Post("auth/sessions/revoke-others")
  @AllowMfaSetup()
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async revokeOthers(@CurrentUser() u: AppUser, @CurrentSession() sid: string, @Req() req: Request) {
    const n = await this.sessions.revokeAll(u.id, sid);
    void this.audit.record({ actor: u, action: "auth.revokeSessions", target: u.id, details: { revoked: n }, ip: req.ip });
    this.realtime.dropUser(u.id, sid);
    return { revoked: n };
  }

  /**
   * Shu kishining profillari (bir telefon, bir muassasa): masalan, o'qituvchi va shu maktabdagi
   * bolaning ota-onasi. Rahbariyat profillari ro'yxatda yo'q: ularga faqat o'z paroli va 2FA bilan.
   */
  @Get("auth/profiles")
  @UseGuards(AuthGuard)
  profiles(@CurrentUser() u: AppUser) {
    const inst = (id?: string) => (id ? this.store.db.institutions.find((i) => i.id === id)?.name ?? "" : "");
    return [u, ...linkedProfiles(this.store.db, u)].map((p) => ({ id: p.id, name: p.name, role: p.role, institution: inst(p.institutionId), current: p.id === u.id }));
  }

  /** Boshqa profilga o'tish: joriy sessiya yopiladi, tanlangan profil uchun yangi sessiya. */
  @Post("auth/profiles/switch")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async switchProfile(@CurrentUser() u: AppUser, @CurrentSession() sid: string, @Body() b: { userId?: string }, @Req() req: Request, @Res({ passthrough: true }) out: Response) {
    const target = linkedProfiles(this.store.db, u).find((p) => p.id === String(b?.userId ?? ""));
    if (!target) throw new CommandError("err.forbidden", {}, 403);
    // 2FA yoqilgan profilga 2FA'siz kirilgan profildan o'tib bo'lmaydi
    if (this.mfa.enabled(target.id) && !this.mfa.enabled(u.id)) throw new CommandError("err.profileMfa", {}, 403);
    const tokens = await this.issue(target.id, req, out);
    await this.sessions.revoke(sid);
    this.realtime.dropSession(sid);
    void this.audit.record({ actor: u, action: "auth.switchProfile", target: target.id, details: { name: target.name, role: target.role }, ip: req.ip });
    return { ...tokens, userId: target.id };
  }

  /** Faoliyat jurnali: direktor (o'z muassasasi) va super admin. */
  @Get("audit")
  @UseGuards(AuthGuard)
  auditLog(@CurrentUser() u: AppUser, @Query("before") before?: string, @Query("limit") limit?: string, @Query("institutionId") institutionId?: string) {
    if (u.role !== "director" && u.role !== "superAdmin") throw new CommandError("err.forbidden", {}, 403);
    return this.audit.list(u, { before, limit: Number(limit), institutionId });
  }

  // ------------------------------------------------------------ ma'lumotlar

  @Get("bootstrap")
  @UseGuards(AuthGuard)
  bootstrap(@CurrentUser() u: AppUser) {
    // Rahbariyat/o'qituvchi: davomat oxirgi 35 kunlik (eskisi /attendance orqali, kerak bo'lganda)
    // Yuz namunalari ixcham (o'qituvchi: ~6 marta kichik)
    return packDatabase(bootstrapFor(this.store.db, u, dayKey(this.store.clock())));
  }

  /** Davomat oralig'i (boshlang'ich yuklashdagi oynadan oldingi kunlar). Ko'rinish qoidalari bilan. */
  @Get("attendance")
  @UseGuards(AuthGuard)
  attendance(@CurrentUser() u: AppUser, @Query("from") from?: string, @Query("to") to?: string) {
    const re = /^\d{4}-\d{2}-\d{2}$/;
    if (!re.test(String(from)) || !re.test(String(to)) || String(from) > String(to)) throw new CommandError("err.invalid", { field: "from" }, 400);
    // Bir so'rovda ko'pi bilan ~13 oy
    if (Date.parse(String(to)) - Date.parse(String(from)) > 400 * 86_400_000) throw new CommandError("err.invalid", { field: "to" }, 400);
    return attendanceBetween(this.store.db, u, String(from), String(to));
  }

  @Post("commands/:name")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async command(@CurrentUser() u: AppUser, @Param("name") name: string, @Body() input: unknown, @Req() req: Request) {
    await this.limits.command(u.id);
    if (!COMMANDS.has(name)) throw new CommandError("err.unknownCommand", { name }, 404);
    if (typeof input !== "object" || input === null) throw new CommandError("err.required", { field: "body" }, 400);
    // Rasmlar (yuz kesimi, namuna surati) yozuv ichida emas — fayl sifatida
    const bytes = name === "attendance.mark" ? await this.snapshots.extract(u.id, (input as { marks?: unknown }).marks)
      : name === "face.enroll" || name === "student.photo" ? await this.snapshots.extractPhoto(u.id, input as { studentId?: unknown; photo?: unknown }) : 0;
    if (bytes) await this.limits.upload(u.id, bytes);
    const patch = await this.store.run(u, name as CommandName, input as CommandMap[CommandName]);
    const inp = input as { id?: unknown; institutionId?: unknown };
    const inst = u.institutionId ?? (typeof inp.institutionId === "string" ? inp.institutionId : undefined)
      ?? (name.startsWith("institution.") ? (typeof inp.id === "string" ? inp.id : patch.upsert?.institutions?.[0]?.id) : undefined);
    void this.audit.command(u, name, input, patch, req.ip ?? "", inst);
    return packPatch(scopePatch(this.store.db, this.store.user(u.id) ?? u, patch));
  }

  /** Real vaqt ulanishi uchun bir martalik chipta (token URL'da yuborilmaydi). */
  @Post("events/ticket")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async eventsTicket(@CurrentUser() u: AppUser, @CurrentSession() sid: string) {
    await this.limits.ticket(u.id);
    return { ticket: await this.sessions.ticket(u.id, sid) };
  }

  @Get("events")
  async events(@Query("ticket") ticket: string, @Res() res: Response) {
    const { userId, sid } = await this.sessions.redeem(String(ticket ?? ""));
    const u = this.store.activeUser(userId);
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    res.write("retry: 5000\n\n");
    this.realtime.add(u.id, res, sid);
  }

  // ------------------------------------------------------------ fayllar

  @Post("files")
  @UseGuards(AuthGuard)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_FILE, files: 1 } }))
  async upload(@CurrentUser() u: AppUser, @UploadedFile() file?: { originalname: string; mimetype: string; size: number; buffer: Buffer }) {
    if (!file) throw new CommandError("err.required", { field: "file" }, 400);
    await this.limits.upload(u.id, file.size);
    const id = randomBytes(16).toString("hex");
    const name = file.originalname.replace(/[\\/\r\n"]/g, "_").slice(0, 120) || "file";
    await this.sql.query("INSERT INTO files (id, owner_id, name, type, size, data) VALUES ($1, $2, $3, $4, $5, $6)", [id, u.id, name, file.mimetype || "application/octet-stream", file.size, file.buffer]);
    return { id, name, type: file.mimetype || "application/octet-stream", size: file.size, url: `${this.config.publicUrl}/files/${id}` };
  }

  /**
   * Fayl havolalarini imzolash: faqat shu foydalanuvchi ko'ra oladigan fayllar (o'zi yuklagan yoki
   * ko'rinadigan vazifa/topshiriqqa biriktirilgan). Imzo 15 daqiqa va shu foydalanuvchiga bog'langan.
   */
  @Post("files/sign")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async signFiles(@CurrentUser() u: AppUser, @Body() b: { ids?: unknown }) {
    const ids = (Array.isArray(b?.ids) ? b.ids : []).filter((x): x is string => typeof x === "string" && FILE_ID_RE.test(x)).slice(0, 100);
    if (!ids.length) return {};
    const rows = await this.sql.query<{ id: string; owner_id: string; student_id: string | null }>("SELECT id, owner_id, student_id FROM files WHERE id = ANY($1::text[])", [ids]);
    const own = new Set(rows.filter((r) => r.owner_id === u.id).map((r) => r.id));
    // Yuz kesimi: o'quvchini ko'ra oladigan har kim (o'qituvchi, ota-onasi, rahbariyat)
    const seeStudent = canSeeStudent(this.store.db, u);
    for (const r of rows) if (r.student_id && seeStudent(r.student_id)) own.add(r.id);
    const visible = ids.every((id) => own.has(id)) ? new Set<string>() : this.visibleFileIds(u);
    const exp = Math.floor(Date.now() / 1000) + FILE_LINK_TTL_S;
    const out: Record<string, string> = {};
    for (const id of ids) {
      if (!own.has(id) && !visible.has(id)) continue;
      out[id] = `${this.config.publicUrl}/files/${id}?e=${exp}&u=${encodeURIComponent(u.id)}&s=${this.fileSig(id, exp, u.id)}`;
    }
    return out;
  }

  /** Foydalanuvchi ko'radigan vazifa va topshiriqlardagi fayllar. */
  private visibleFileIds(u: AppUser): Set<string> {
    const db = scopeDatabase(this.store.db, u);
    const set = new Set<string>();
    for (const list of [db.homeworks, db.submissions]) {
      for (const x of list) for (const a of x.attachments) {
        const m = /\/files\/([0-9a-f]{32})/.exec(a.url);
        if (m) set.add(m[1]);
      }
    }
    return set;
  }

  private fileSig(id: string, exp: number, userId: string): string {
    return createHmac("sha256", this.config.jwtSecret).update(`file:${id}:${exp}:${userId}`).digest("base64url");
  }

  /** Faqat imzolangan havola bilan (muddati 15 daqiqa, foydalanuvchi faol bo'lishi kerak). */
  @Get("files/:id")
  async download(@Param("id") id: string, @Query("e") e: string, @Query("u") uid: string, @Query("s") sig: string, @Res() res: Response) {
    if (!FILE_ID_RE.test(id)) throw new CommandError("err.notFound", {}, 404);
    const exp = Number(e);
    const want = this.fileSig(id, exp, String(uid ?? ""));
    const ok = typeof sig === "string" && sig.length === want.length && timingSafeEqual(Buffer.from(sig), Buffer.from(want));
    if (!ok || !(exp * 1000 > Date.now()) || exp * 1000 > Date.now() + FILE_LINK_TTL_S * 1000 + 60_000) throw new CommandError("err.forbidden", {}, 401);
    this.store.activeUser(String(uid));
    const [f] = await this.sql.query<{ name: string; type: string; data: Buffer | Uint8Array }>("SELECT name, type, data FROM files WHERE id = $1", [id]);
    if (!f) throw new CommandError("err.notFound", {}, 404);
    const safeType = /^(image\/(png|jpeg|gif|webp)|application\/pdf|text\/plain)$/.test(f.type) ? f.type : "application/octet-stream";
    res.setHeader("Content-Type", safeType);
    res.setHeader("Content-Disposition", `${safeType === "application/octet-stream" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(f.name)}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    res.setHeader("Cache-Control", "private, max-age=600");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.end(Buffer.from(f.data));
  }

  // ------------------------------------------------------------ push

  @Get("push/key")
  pushKey() {
    return { key: this.push.publicKey };
  }

  @Post("push/subscribe")
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async pushSubscribe(@CurrentUser() u: AppUser, @Body() b: { endpoint?: string; keys?: { p256dh?: string; auth?: string }; lang?: Lang }) {
    try {
      await this.push.subscribe(u.id, b, b?.lang === "ru" ? "ru" : "uz");
    } catch {
      throw new CommandError("err.required", { field: "subscription" }, 400);
    }
  }

  // ------------------------------------------------------------ to'lov tizimlari

  @Post("payments/click/prepare")
  @HttpCode(200)
  clickPrepare(@Body() b: ClickRequest) {
    return this.payments.click(b, "prepare");
  }

  @Post("payments/click/complete")
  @HttpCode(200)
  clickComplete(@Body() b: ClickRequest) {
    return this.payments.click(b, "complete");
  }

  @Post("payments/payme")
  @HttpCode(200)
  payme(@Body() b: { id?: unknown; method?: string; params?: Record<string, unknown> }, @Headers("authorization") auth?: string) {
    return this.payments.payme(b, this.payments.paymeAuthorized(auth));
  }
}
