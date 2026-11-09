import { Global, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Body, Controller, Get, Param, Post, Query, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../../common/auth.decorators';
import { NotFound } from '../../common/errors';
import { PrismaService, Tx } from '../../common/prisma.service';

export interface NotifyInput { userId: string; type: string; title: string; body: string; link?: string; dedupeKey: string }
const DAY = 86400000;
const kstDate = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);

/**
 * 인앱 알림. 업무 트랜잭션 안에서 호출하면 함께 커밋/롤백된다.
 * dedupeKey 유니크 → 재시도·배치 재실행에도 1건. 외부 발송(이메일·푸시)은 하지 않음 (SES·푸시 키 대기).
 */
@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Notifications');
  private timer?: NodeJS.Timeout;
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => this.runDaily().catch((e) => this.logger.error(e)), 6 * 3600_000);
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async notify(db: Tx | PrismaService, n: NotifyInput) {
    await db.notification.createMany({ data: [n], skipDuplicates: true });
  }
  async notifyMany(db: Tx | PrismaService, list: NotifyInput[]) {
    if (list.length) await db.notification.createMany({ data: list, skipDuplicates: true });
    return list.length;
  }

  async list(userId: string, cursor?: string, take = 30) {
    const rows = await this.prisma.notification.findMany({ where: { userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: take + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    const unread = await this.prisma.notification.count({ where: { userId, readAt: null } });
    return { items: rows.slice(0, take), nextCursor: rows.length > take ? rows[take - 1].id : null, unread };
  }
  async unread(userId: string) { return { unread: await this.prisma.notification.count({ where: { userId, readAt: null } }) }; }
  async read(userId: string, id: string) {
    const r = await this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
    if (!r.count && !(await this.prisma.notification.findFirst({ where: { id, userId } }))) throw NotFound('알림');
    return this.unread(userId);
  }
  async readAll(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { unread: 0 };
  }

  /**
   * 일일 배치 (6시간 주기·재실행 안전):
   *  - 포인트 만료 7일 전 안내 (적립 로트별 1회)
   *  - 관심 공고·지원사업 마감 3일 전 안내 (항목별 1회)
   */
  async runDaily(now = new Date()) {
    const soon = new Date(now.getTime() + 7 * DAY), d3 = new Date(now.getTime() + 3 * DAY);
    const lots = await this.prisma.$queryRaw<{ id: string; userId: string; expiresAt: Date; remaining: number }[]>(Prisma.sql`
      SELECT e.id, e."userId", e."expiresAt", e.amount AS remaining FROM "PointLedgerEntry" e
      WHERE e.type = 'EARN' AND e.amount > 0 AND e."expiresAt" > ${now} AND e."expiresAt" <= ${soon}
        AND NOT EXISTS (SELECT 1 FROM "PointLedgerEntry" x WHERE x."dedupeKey" = 'expire:' || e.id)`);
    const pts = await this.notifyMany(this.prisma, lots.map((l) => ({
      userId: l.userId, type: 'POINTS_EXPIRING', title: '곧 만료되는 포인트가 있어요', body: `${kstDate(l.expiresAt)} 에 만료 예정인 적립 포인트가 있어요. 포인트몰에서 사용해 보세요.`, link: '/my/points', dedupeKey: `points-expiring:${l.id}`,
    })));
    const jobs = await this.prisma.savedJob.findMany({ where: { job: { status: 'ACTIVE', expiresAt: { gt: now, lte: d3 } } }, include: { job: { select: { id: true, title: true, companyName: true, expiresAt: true } } } });
    const progs = await this.prisma.savedProgram.findMany({ where: { program: { status: 'ACTIVE', applyEnd: { gt: now, lte: d3 } } }, include: { program: { select: { id: true, title: true, applyEnd: true } } } });
    const closing = await this.notifyMany(this.prisma, [
      ...jobs.map((s) => ({ userId: s.userId, type: 'SAVED_JOB_CLOSING', title: '관심 공고 마감이 다가와요', body: `${s.job.companyName} · ${s.job.title} — ${kstDate(s.job.expiresAt!)} 마감`, link: `/jobs/${s.job.id}`, dedupeKey: `job-closing:${s.userId}:${s.job.id}` })),
      ...progs.map((s) => ({ userId: s.userId, type: 'SAVED_PROGRAM_CLOSING', title: '관심 지원사업 접수 마감이 다가와요', body: `${s.program.title} — ${kstDate(s.program.applyEnd!)} 마감`, link: `/startup/programs/${s.program.id}`, dedupeKey: `program-closing:${s.userId}:${s.program.id}` })),
    ]);
    return { pointsExpiring: pts, closing };
  }
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller()
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}
  @Get('me/notifications') list(@CurrentUser() u: AuthUser, @Query('cursor') cursor?: string) { return this.svc.list(u.id, cursor); }
  @Get('me/notifications/unread') unread(@CurrentUser() u: AuthUser) { return this.svc.unread(u.id); }
  @Put('me/notifications/:id/read') read(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.read(u.id, id); }
  @Post('me/notifications/read-all') readAll(@CurrentUser() u: AuthUser) { return this.svc.readAll(u.id); }
  @Roles('SUPER_ADMIN') @Post('admin/notifications/run-daily') run(@Body() _b: unknown) { return this.svc.runDaily(); }
}

@Global()
@Module({ providers: [NotificationsService], controllers: [NotificationsController], exports: [NotificationsService] })
export class NotificationsModule {}
