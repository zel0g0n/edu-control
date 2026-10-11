import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata, createParamDecorator } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { CommandError, type AppUser } from "@edunazorat/shared";

import { StoreService } from "../store.service";
import { CredentialsService } from "./credentials.service";
import { MfaService } from "./mfa.service";
import { SessionService } from "./session.service";
import { TokenService } from "./token.service";

export function tokenFrom(req: Request): string | null {
  // Token faqat sarlavhada (URL'da emas: loglarga va tarixga tushmasin)
  const h = req.headers.authorization;
  if (h?.startsWith("Bearer ") && h.length < 2048) return h.slice(7);
  return null;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(StoreService) private readonly store: StoreService,
    @Inject(CredentialsService) private readonly creds: CredentialsService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(MfaService) private readonly mfa: MfaService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AppUser; sid?: string }>();
    const token = tokenFrom(req);
    if (!token) throw new CommandError("err.forbidden", {}, 401);
    const { userId, version, sid } = this.tokens.verify(token);
    // Parol tiklangan bo'lsa eski sessiya bekor
    if (version !== this.creds.tokenVersion(userId)) throw new CommandError("err.sessionExpired", {}, 401);
    // Sessiya serverda faol bo'lishi kerak (chiqish, "barcha qurilmalardan chiqish", muddat)
    await this.sessions.check(sid, userId);
    req.user = this.store.activeUser(userId);
    req.sid = sid;
    // Rahbariyat 2FA'ni yoqmaguncha faqat sozlash (va chiqish) ishlaydi
    if (this.mfa.setupRequired(req.user) && !this.reflector.get<boolean>(ALLOW_MFA_SETUP, ctx.getHandler())) {
      throw new CommandError("err.mfaSetupRequired", {}, 403);
    }
    return true;
  }
}

const ALLOW_MFA_SETUP = "allowMfaSetup";
/** 2FA hali sozlanmagan rahbariyat a'zosi ham chaqira oladi. */
export const AllowMfaSetup = () => SetMetadata(ALLOW_MFA_SETUP, true);

export const CurrentSession = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<{ sid?: string }>().sid ?? "");

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<{ user: AppUser }>().user);
