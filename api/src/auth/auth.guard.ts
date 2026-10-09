import { CanActivate, ExecutionContext, Inject, Injectable, createParamDecorator } from "@nestjs/common";
import type { Request } from "express";
import { CommandError, type AppUser } from "@edunazorat/shared";

import { StoreService } from "../store.service";
import { TokenService } from "./token.service";

export function tokenFrom(req: Request): string | null {
  const h = req.headers.authorization;
  if (h?.startsWith("Bearer ")) return h.slice(7);
  // EventSource sarlavha yubora olmaydi: faqat /events uchun so'rov qatorida.
  if (req.path === "/events" && typeof req.query.token === "string") return req.query.token;
  return null;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(TokenService) private readonly tokens: TokenService, @Inject(StoreService) private readonly store: StoreService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AppUser }>();
    const token = tokenFrom(req);
    if (!token) throw new CommandError("err.forbidden", {}, 401);
    req.user = this.store.activeUser(this.tokens.verify(token));
    return true;
  }
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<{ user: AppUser }>().user);
