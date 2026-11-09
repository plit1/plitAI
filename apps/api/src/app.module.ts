import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import { AuthGuard } from './common/auth.guard';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { PrismaModule } from './common/prisma.service';
import { validateEnv } from './config/env';
import { limit } from './common/throttle';
import { AdminModule } from './modules/admin/admin.module';
import { AuditModule } from './modules/admin/audit.service';
import { AuthModule } from './modules/auth/auth.module';
import { CertificationsModule } from './modules/certifications/certifications.module';
import { ChallengesModule } from './modules/challenges/challenges.module';
import { EntitlementModule } from './modules/challenges/entitlement.service';
import { HealthController } from './modules/health/health.controller';
import { PaymentsModule } from './modules/payments/payments.module';
import { OpenRunModule } from './modules/open-run/open-run.module';
import { ExamScheduleModule } from './modules/exam-schedule/exam-schedule.module';
import { QuizModule } from './modules/quiz/quiz.module';
import { StrategyModule } from './modules/strategy/strategy.module';
import { CommunityModule } from './modules/community/community.module';
import { PointsModule } from './modules/points/points.module';
import { PolicyModule } from './modules/policy/policy.module';
import { StudyModule } from './modules/study/study.module';
import { UsersModule } from './modules/users/users.module';
import { VerificationsModule } from './modules/verifications/verifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
        genReqId: (req) => (req.headers['x-request-id'] as string) || randomUUID(),
        redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
      },
    }),
    JwtModule.registerAsync({ global: true, useFactory: () => ({ secret: process.env.JWT_ACCESS_SECRET, signOptions: { expiresIn: (process.env.JWT_ACCESS_TTL || '15m') as any } }) }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: limit(120) }]),
    PrismaModule, AuditModule, PolicyModule, PointsModule, EntitlementModule, AuthModule, UsersModule,
    CertificationsModule, ChallengesModule, StudyModule, PaymentsModule, VerificationsModule, AdminModule, OpenRunModule, ExamScheduleModule, QuizModule, StrategyModule, CommunityModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
