import { DynamicModule, Module } from "@nestjs/common";

import { AppController } from "./app.controller";
import { AuthGuard } from "./auth/auth.guard";
import { OtpService } from "./auth/otp.service";
import { SmsService } from "./auth/sms.service";
import { TokenService } from "./auth/token.service";
import { CONFIG, type Config } from "./config";
import { SQL, type Sql } from "./db/sql";
import { PaymentsService } from "./payments.service";
import { PushService } from "./push.service";
import { RealtimeService } from "./realtime.service";
import { StoreService } from "./store.service";

@Module({})
export class AppModule {
  static create(config: Config, sql: Sql): DynamicModule {
    return {
      module: AppModule,
      controllers: [AppController],
      providers: [
        { provide: CONFIG, useValue: config },
        { provide: SQL, useValue: sql },
        StoreService, SmsService, OtpService, TokenService, AuthGuard, RealtimeService, PushService, PaymentsService,
      ],
    };
  }
}
