import { Inject, Injectable } from "@nestjs/common";
import jwt from "jsonwebtoken";
import { CommandError } from "@edunazorat/shared";

import { CONFIG, type Config } from "../config";

/** Kirish (access) tokeni: 15 daqiqa, faqat xotirada saqlanadi. Muddati tugasa refresh token bilan yangilanadi. */
export const ACCESS_TTL_S = 15 * 60;
@Injectable()
export class TokenService {
  constructor(@Inject(CONFIG) private readonly config: Config) {}

  /** v: parol versiyasi. Parol tiklansa versiya oshadi va eski tokenlar ishlamay qoladi. */
  sign(userId: string, version: number, sid: string): string {
    return jwt.sign({ sub: userId, v: version, sid }, this.config.jwtSecret, { expiresIn: ACCESS_TTL_S, algorithm: "HS256", issuer: "edunazorat" });
  }

  /** Parol to'g'ri, 2FA kodi kutilmoqda: 5 daqiqalik oraliq token (faqat /auth/mfa/verify uchun). */
  signMfa(userId: string, version: number): string {
    return jwt.sign({ sub: userId, v: version, purpose: "mfa" }, this.config.jwtSecret, { expiresIn: 300, algorithm: "HS256", issuer: "edunazorat", audience: "mfa" });
  }

  verifyMfa(token: string): { userId: string; version: number } {
    try {
      const p = jwt.verify(token, this.config.jwtSecret, { algorithms: ["HS256"], issuer: "edunazorat", audience: "mfa" }) as { sub?: string; v?: number; purpose?: string };
      if (!p.sub || p.purpose !== "mfa") throw new Error("mfa");
      return { userId: p.sub, version: Number(p.v ?? 0) };
    } catch {
      throw new CommandError("err.mfaExpired", {}, 401);
    }
  }

  verify(token: string): { userId: string; version: number; sid?: string } {
    try {
      const p = jwt.verify(token, this.config.jwtSecret, { algorithms: ["HS256"], issuer: "edunazorat" }) as { sub?: string; v?: number; sid?: string; purpose?: string; aud?: unknown };
      // 2FA oraliq tokeni kirish tokeni o'rnida ishlamaydi
      if (!p.sub || !p.sid || p.purpose || p.aud) throw new Error("sub");
      return { userId: p.sub, version: Number(p.v ?? 0), sid: p.sid };
    } catch (e) {
      // Muddati tugagan: mijoz jimgina yangilaydi
      if (e instanceof jwt.TokenExpiredError) throw new CommandError("err.tokenExpired", {}, 401);
      throw new CommandError("err.forbidden", {}, 401);
    }
  }
}
