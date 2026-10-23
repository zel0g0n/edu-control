import { DynamicModule, Module } from "@nestjs/common";

import { AppController } from "./app.controller";
import { AuthGuard } from "./auth/auth.guard";
import { CredentialsService } from "./auth/credentials.service";
import { OtpService } from "./auth/otp.service";
import { SmsService } from "./auth/sms.service";
import { MfaService } from "./auth/mfa.service";
import { SessionService } from "./auth/session.service";
import { TokenService } from "./auth/token.service";
import { CONFIG, type Config } from "./config";
import { SQL, type Sql } from "./db/sql";
import { NvrController, NvrKeyGuard } from "./nvr.controller";
import { ZamsController, ZamsGuard, ZamsVerifyService } from "./zams.controller";
import { AuditService } from "./audit.service";
import { ClusterService } from "./cluster.service";
import { LimitsService } from "./limits.service";
import { PaymentsService } from "./payments.service";
import { PushService } from "./push.service";
import { SnapshotsService } from "./snapshots.service";
import { RealtimeService } from "./realtime.service";
import { StoreService } from "./store.service";

@Module({})
export class AppModule {
  static create(config: Config, sql: Sql): DynamicModule {
    return {
      module: AppModule,
      controllers: [AppController, NvrController, ZamsController],
      providers: [
        { provide: CONFIG, useValue: config },
        { provide: SQL, useValue: sql },
        ClusterService, StoreService, SessionService, MfaService, LimitsService, AuditService, CredentialsService, SmsService, OtpService, TokenService, AuthGuard, RealtimeService, PushService, PaymentsService, NvrKeyGuard, SnapshotsService, ZamsVerifyService, ZamsGuard,
      ],
    };
  }
}
