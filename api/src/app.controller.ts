import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { randomBytes } from "node:crypto";
import { CommandError, scopeDatabase, scopePatch, type AppUser, type CommandMap, type CommandName, type Lang } from "@edunazorat/shared";

import { AuthGuard, CurrentUser } from "./auth/auth.guard";
import { OtpService } from "./auth/otp.service";
import { TokenService } from "./auth/token.service";
import { CONFIG, type Config } from "./config";
import { SQL, type Sql } from "./db/sql";
import { PaymentsService, type ClickRequest } from "./payments.service";
import { PushService } from "./push.service";
import { RealtimeService } from "./realtime.service";
import { StoreService } from "./store.service";

const COMMANDS = new Set<string>([
  "attendance.mark", "grade.add", "grade.remove", "grade.setFinal", "homework.save", "homework.delete", "submission.submit",
  "submission.review", "invoice.generate", "invoice.adjust", "payment.add", "message.send", "thread.read", "notification.read",
  "announcement.send", "consent.set", "face.enroll", "student.save", "student.archive", "teacher.save", "teacher.setActive",
  "class.save", "class.delete", "lesson.save", "lesson.delete", "term.save", "settings.save", "institution.save", "institution.setActive",
  // "payment.demoOnline" serverda yo'q: haqiqiy to'lov faqat Click/Payme orqali.
] satisfies CommandName[]);

const MAX_FILE = 2 * 1024 * 1024;

@Controller()
export class AppController {
  constructor(
    @Inject(StoreService) private readonly store: StoreService,
    @Inject(OtpService) private readonly otp: OtpService,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(RealtimeService) private readonly realtime: RealtimeService,
    @Inject(PushService) private readonly push: PushService,
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Inject(SQL) private readonly sql: Sql,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  @Get("health")
  health() {
    return { ok: true, users: this.store.db.users.length, realtime: this.realtime.connected, push: this.push.enabled };
  }

  // ------------------------------------------------------------ kirish

  @Post("auth/request-code")
  @HttpCode(200)
  requestCode(@Body() b: { phone?: string }) {
    return this.otp.request(String(b?.phone ?? ""));
  }

  @Post("auth/verify-code")
  @HttpCode(200)
  verifyCode(@Body() b: { phone?: string; code?: string }) {
    const u = this.otp.verify(String(b?.phone ?? ""), String(b?.code ?? ""));
    return { token: this.tokens.sign(u.id), userId: u.id };
  }

  @Post("auth/sign-out")
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async signOut(@CurrentUser() u: AppUser, @Body() b: { endpoint?: string }) {
    await this.push.unsubscribeUser(u.id, b?.endpoint);
  }

  // ------------------------------------------------------------ ma'lumotlar

  @Get("bootstrap")
  @UseGuards(AuthGuard)
  bootstrap(@CurrentUser() u: AppUser) {
    return scopeDatabase(this.store.db, u);
  }

  @Post("commands/:name")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async command(@CurrentUser() u: AppUser, @Param("name") name: string, @Body() input: unknown) {
    if (!COMMANDS.has(name)) throw new CommandError("err.unknownCommand", { name }, 404);
    if (typeof input !== "object" || input === null) throw new CommandError("err.required", { field: "body" }, 400);
    const patch = await this.store.run(u, name as CommandName, input as CommandMap[CommandName]);
    return scopePatch(this.store.db, this.store.user(u.id) ?? u, patch);
  }

  @Get("events")
  @UseGuards(AuthGuard)
  events(@CurrentUser() u: AppUser, @Res() res: Response) {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    res.write("retry: 5000\n\n");
    this.realtime.add(u.id, res);
  }

  // ------------------------------------------------------------ fayllar

  @Post("files")
  @UseGuards(AuthGuard)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_FILE, files: 1 } }))
  async upload(@CurrentUser() u: AppUser, @UploadedFile() file?: { originalname: string; mimetype: string; size: number; buffer: Buffer }) {
    if (!file) throw new CommandError("err.required", { field: "file" }, 400);
    const id = randomBytes(16).toString("hex");
    const name = file.originalname.replace(/[\\/\r\n"]/g, "_").slice(0, 120) || "file";
    await this.sql.query("INSERT INTO files (id, owner_id, name, type, size, data) VALUES ($1, $2, $3, $4, $5, $6)", [id, u.id, name, file.mimetype || "application/octet-stream", file.size, file.buffer]);
    return { id, name, type: file.mimetype || "application/octet-stream", size: file.size, url: `${this.config.publicUrl}/files/${id}` };
  }

  /** Fayl havolasi taxmin qilib bo'lmaydigan 128 bitli id (rasm/hujjatni <img>/<a> ochishi uchun). */
  @Get("files/:id")
  async download(@Param("id") id: string, @Res() res: Response) {
    if (!/^[0-9a-f]{32}$/.test(id)) throw new CommandError("err.notFound", {}, 404);
    const [f] = await this.sql.query<{ name: string; type: string; data: Buffer | Uint8Array }>("SELECT name, type, data FROM files WHERE id = $1", [id]);
    if (!f) throw new CommandError("err.notFound", {}, 404);
    const safeType = /^(image\/(png|jpeg|gif|webp)|application\/pdf|text\/plain)$/.test(f.type) ? f.type : "application/octet-stream";
    res.setHeader("Content-Type", safeType);
    res.setHeader("Content-Disposition", `${safeType === "application/octet-stream" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(f.name)}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    res.setHeader("Cache-Control", "private, max-age=86400");
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
