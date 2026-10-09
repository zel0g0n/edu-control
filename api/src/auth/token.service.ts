import { Inject, Injectable } from "@nestjs/common";
import jwt from "jsonwebtoken";
import { CommandError } from "@edunazorat/shared";

import { CONFIG, type Config } from "../config";

/** JWT: 30 kun. Foydalanuvchi bloklansa, har so'rovda bazadan tekshiriladi. */
@Injectable()
export class TokenService {
  constructor(@Inject(CONFIG) private readonly config: Config) {}

  sign(userId: string): string {
    return jwt.sign({ sub: userId }, this.config.jwtSecret, { expiresIn: "30d", algorithm: "HS256" });
  }

  verify(token: string): string {
    try {
      const p = jwt.verify(token, this.config.jwtSecret, { algorithms: ["HS256"] }) as { sub?: string };
      if (!p.sub) throw new Error("sub");
      return p.sub;
    } catch {
      throw new CommandError("err.forbidden", {}, 401);
    }
  }
}
