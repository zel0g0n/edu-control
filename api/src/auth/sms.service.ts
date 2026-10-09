import { Inject, Injectable, Logger } from "@nestjs/common";

import { CONFIG, type Config } from "../config";

/**
 * SMS yuborish: Eskiz.uz (O'zbekistonda keng tarqalgan). Matn shabloni Eskiz
 * kabinetida tasdiqlangan bo'lishi kerak. SMS_DEV_MODE=true bo'lsa yuborilmaydi.
 */
@Injectable()
export class SmsService {
  private readonly log = new Logger("SMS");
  private token: string | null = null;

  constructor(@Inject(CONFIG) private readonly config: Config) {}

  get devMode() {
    return this.config.smsDevMode;
  }

  private async login(): Promise<string> {
    const body = new FormData();
    body.set("email", this.config.eskizEmail ?? "");
    body.set("password", this.config.eskizPassword ?? "");
    const res = await fetch("https://notify.eskiz.uz/api/auth/login", { method: "POST", body });
    const data = (await res.json().catch(() => null)) as { data?: { token?: string } } | null;
    if (!res.ok || !data?.data?.token) throw new Error(`Eskiz login xatosi: ${res.status}`);
    this.token = data.data.token;
    return this.token;
  }

  async send(phone: string, text: string): Promise<void> {
    if (this.devMode) {
      this.log.warn(`[dev] SMS ${phone}: ${text}`);
      return;
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = this.token ?? (await this.login());
      const body = new FormData();
      body.set("mobile_phone", phone);
      body.set("message", text);
      body.set("from", this.config.eskizFrom);
      const res = await fetch("https://notify.eskiz.uz/api/message/sms/send", { method: "POST", body, headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) {
        this.token = null;
        continue;
      }
      if (!res.ok) throw new Error(`Eskiz SMS xatosi: ${res.status} ${await res.text().catch(() => "")}`);
      return;
    }
    throw new Error("Eskiz: avtorizatsiya xatosi");
  }
}
