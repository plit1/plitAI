import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User } from '@prisma/client';
import { AppError, Conflict, NotFound } from '../../common/errors';
import { PrismaService, Tx } from '../../common/prisma.service';
import { AuditService } from '../admin/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PointsService } from '../points/points.service';
import { PolicyService } from '../policy/policy.service';
import { anon, checks, DUP_WINDOW_DAYS, failReason, fingerprint, kstMonth, maskNickname, REWARD_TYPE } from './referral.rules';

const DAY = 86400000;

@Injectable()
export class ReferralService {
  private readonly logger = new Logger('Referral');
  constructor(
    private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly policy: PolicyService,
    private readonly points: PointsService, private readonly audit: AuditService, private readonly notifications: NotificationsService,
  ) {}

  private fp(v?: string | null) { return fingerprint(v, this.config.get<string>('JWT_ACCESS_SECRET') ?? ''); }

  /**
   * 가입 시 귀속 (같은 트랜잭션). 최초 귀속만 인정 — refereeId PK 로 변경 불가.
   * 중복 계정 의심: 같은 추천인의 다른 피추천인과 IP 지문이 같거나, 추천인의 최근 로그인 IP 와 같으면 표시 (보상 승인 시 거절 사유)
   */
  async attribute(tx: Tx, referee: User, referrer: User, meta: { ip?: string; ua?: string }, offeringId?: string) {
    if (referrer.id === referee.id) return;
    const ipHash = this.fp(meta.ip), uaHash = this.fp(meta.ua);
    const since = new Date(Date.now() - DUP_WINDOW_DAYS * DAY);
    let dupReason: string | null = null;
    if (ipHash) {
      const sibling = await tx.referralAttribution.findFirst({ where: { referrerId: referrer.id, ipHash, createdAt: { gte: since } } });
      if (sibling) dupReason = '같은 추천인의 다른 초대 가입과 접속 환경이 같아요';
      if (!dupReason && meta.ip) {
        const own = await tx.refreshToken.findFirst({ where: { userId: referrer.id, ip: meta.ip, createdAt: { gte: since } } });
        if (own) dupReason = '추천인 본인의 최근 접속 환경과 같아요';
      }
    }
    await tx.referralAttribution.create({ data: { refereeId: referee.id, referrerId: referrer.id, code: referrer.referralCode, offeringId: offeringId ?? null, ipHash, uaHash, dupSuspect: !!dupReason, dupReason } });
  }

  /** 피추천인의 첫 유효 학습 완료 시 (학습 완료 트랜잭션 안) → 승인 대기 보상 1건 */
  async onValidStudy(tx: Tx, userId: string, enrollmentId: string, sessionId: string) {
    const att = await tx.referralAttribution.findUnique({ where: { refereeId: userId } });
    if (!att) return null;
    const { values } = await this.policy.current(tx);
    const r = await tx.referralReward.createMany({ data: [{ referrerId: att.referrerId, refereeId: userId, rewardType: REWARD_TYPE, enrollmentId, studySessionId: sessionId, amount: values.referralReward }], skipDuplicates: true });
    return r.count ? 'PENDING' : null;
  }

  // ── 회원 ──
  async summary(userId: string, origin: string) {
    const [me, enrollments, atts, rewards, policy] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { referralCode: true } }),
      this.prisma.enrollment.count({ where: { userId, status: { not: 'CANCELLED' } } }),
      this.prisma.referralAttribution.findMany({ where: { referrerId: userId }, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.referralReward.findMany({ where: { referrerId: userId }, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.policy.current(),
    ]);
    const month = await this.monthUsage(this.prisma, userId);
    const byReferee = new Map(rewards.map((r) => [r.refereeId, r]));
    const firstEnr = await this.prisma.enrollment.findMany({ where: { userId: { in: atts.map((a) => a.refereeId) } }, select: { userId: true, status: true }, distinct: ['userId'] });
    const joined = new Set(firstEnr.map((e) => e.userId));
    return {
      code: me.referralCode, eligible: enrollments > 0, link: `${origin}/invite/${me.referralCode}`,
      policy: { reward: policy.values.referralReward, monthlyCount: policy.values.referralMonthlyCount, monthlyPoints: policy.values.referralMonthlyPoints },
      month, stats: { invited: atts.length, joined: joined.size, pending: rewards.filter((r) => r.status === 'PENDING').length, rewarded: rewards.filter((r) => r.status === 'REWARDED').length },
      friends: atts.map((a) => {
        const rw = byReferee.get(a.refereeId);
        return { alias: anon(a.refereeId), joinedAt: a.createdAt, step: rw ? (rw.status === 'REWARDED' ? 'REWARDED' : rw.status === 'REJECTED' ? 'REJECTED' : 'PENDING_APPROVAL') : joined.has(a.refereeId) ? 'ENROLLED' : 'SIGNED_UP', amount: rw?.amount ?? null };
      }),
      rules: ['친구가 내 초대 링크로 새로 가입하고, 첫 챌린지에 참여해 1분 이상 공부하면 보상 대상이 돼요.', '운영 확인 후 포인트가 적립돼요. 가입만으로는 보상이 없어요.', '같은 친구는 한 번만, 추천인은 한 달 한도 안에서만 받을 수 있어요.', '자기 추천·중복 계정은 보상 대상이 아니에요.'],
    };
  }

  /** 초대 링크 랜딩 (공개): 코드 유효성 + 마스킹된 닉네임만 */
  async landing(code: string) {
    const u = await this.prisma.user.findUnique({ where: { referralCode: code.toUpperCase() }, select: { nickname: true, status: true } });
    if (!u || u.status !== 'ACTIVE') return { valid: false };
    const { values } = await this.policy.current();
    return { valid: true, code: code.toUpperCase(), inviter: maskNickname(u.nickname), welcomePoints: values.welcomePoints };
  }

  private async monthUsage(db: Tx | PrismaService, referrerId: string, now = new Date()) {
    const m = kstMonth(now);
    const start = new Date(`${m}-01T00:00:00+09:00`);
    const rows = await db.referralReward.findMany({ where: { referrerId, status: 'REWARDED', decidedAt: { gte: start } }, select: { amount: true } });
    return { month: m, count: rows.length, points: rows.reduce((a, r) => a + r.amount, 0) };
  }

  // ── 관리자 ──
  async adminList(status?: 'PENDING' | 'REWARDED' | 'REJECTED') {
    const rows = await this.prisma.referralReward.findMany({ where: status ? { status } : {}, orderBy: { createdAt: 'desc' }, take: 200 });
    const atts = await this.prisma.referralAttribution.findMany({ where: { refereeId: { in: rows.map((r) => r.refereeId) } } });
    const users = await this.prisma.user.findMany({ where: { id: { in: [...rows.map((r) => r.referrerId), ...rows.map((r) => r.refereeId)] } }, select: { id: true, nickname: true, email: true } });
    const u = new Map(users.map((x) => [x.id, x]));
    const a = new Map(atts.map((x) => [x.refereeId, x]));
    return rows.map((r) => ({ ...r, referrer: u.get(r.referrerId)?.nickname, referee: u.get(r.refereeId)?.nickname, dupSuspect: a.get(r.refereeId)?.dupSuspect ?? false, dupReason: a.get(r.refereeId)?.dupReason ?? null }));
  }

  /** 승인: 행 잠금 → 재검증(실패 시 자동 거절) → 원장 적립(dedupeKey) → 알림 → 감사 로그 */
  async approve(adminId: string, rewardId: string, ip?: string, opts: { overrideDup?: boolean; note?: string } = {}) {
    if (opts.overrideDup && !opts.note?.trim()) throw new AppError('NOTE_REQUIRED', '중복 의심을 해제하려면 확인 내용을 입력해주세요.');
    return this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "ReferralReward" WHERE id = ${rewardId} FOR UPDATE`;
      if (!row) throw NotFound('초대 보상');
      const rw = await tx.referralReward.findUniqueOrThrow({ where: { id: rewardId } });
      if (rw.status !== 'PENDING') throw Conflict('ALREADY_DECIDED', rw.status === 'REWARDED' ? '이미 지급된 건이에요.' : '이미 처리된 건이에요.');
      // 같은 추천인의 동시 승인으로 월 한도를 넘지 않도록 추천인 단위 잠금
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'referral:' + rw.referrerId}))`;
      const [att, referrer, enr, session, rewardedKey, month, { values }] = await Promise.all([
        tx.referralAttribution.findUnique({ where: { refereeId: rw.refereeId } }),
        tx.user.findUnique({ where: { id: rw.referrerId }, select: { status: true } }),
        tx.enrollment.findUnique({ where: { id: rw.enrollmentId }, select: { status: true } }),
        tx.studySession.findUnique({ where: { id: rw.studySessionId }, select: { status: true } }),
        tx.pointLedgerEntry.findUnique({ where: { dedupeKey: `referral:${rw.refereeId}:${rw.rewardType}` } }),
        this.monthUsage(tx, rw.referrerId),
        this.policy.current(tx),
      ]);
      const referrerEnrollments = await tx.enrollment.count({ where: { userId: rw.referrerId } });
      const c = checks({
        referrerActive: referrer?.status === 'ACTIVE', referrerHasEnrollment: referrerEnrollments > 0, attributed: !!att && att.referrerId === rw.referrerId,
        selfReferral: rw.referrerId === rw.refereeId, dupSuspect: !!att?.dupSuspect, enrollmentActive: !!enr && enr.status !== 'CANCELLED',
        hasValidStudy: session?.status === 'COMPLETED', alreadyRewarded: !!rewardedKey, month, limit: { count: values.referralMonthlyCount, points: values.referralMonthlyPoints }, amount: rw.amount,
      });
      const now = new Date();
      // 중복 의심만 걸린 경우: 운영자가 확인 내용을 남기고 해제할 수 있음 (같은 와이파이 가족 등). 다른 항목은 해제 불가
      const failed = c.filter((x) => !x.ok);
      const dupOnly = failed.length === 1 && failed[0].key === 'dup';
      if (dupOnly && !opts.overrideDup) throw Conflict('DUP_SUSPECT', `중복 계정 의심 건이에요 (${att?.dupReason ?? ''}). 확인 후 해제 승인하거나 거절해주세요.`);
      if (failed.length && !dupOnly) {
        const reason = failReason(c);
        await tx.referralReward.update({ where: { id: rw.id }, data: { status: 'REJECTED', reason, checks: c, decidedById: adminId, decidedAt: now } });
        await this.audit.log(tx, { actorId: adminId, action: 'REFERRAL_AUTO_REJECT', targetType: 'ReferralReward', targetId: rw.id, after: { reason }, ip });
        return { status: 'REJECTED' as const, reason, checks: c };
      }
      const { entry } = await this.points.post(tx, { userId: rw.referrerId, type: 'EARN', amount: rw.amount, reason: `친구 초대 보상 · ${anon(rw.refereeId)} 첫 학습 완료`, dedupeKey: `referral:${rw.refereeId}:${rw.rewardType}`, refType: 'ReferralReward', refId: rw.id, createdById: adminId });
      await tx.referralReward.update({ where: { id: rw.id }, data: { status: 'REWARDED', checks: c, decidedById: adminId, decidedAt: now, ledgerEntryId: entry.id } });
      await this.notifications.notify(tx, { userId: rw.referrerId, type: 'REFERRAL_REWARDED', title: `친구 초대 보상 ${rw.amount.toLocaleString('ko-KR')}P가 적립됐어요`, body: `${anon(rw.refereeId)} 님이 첫 학습을 완료했어요.`, link: '/referral', dedupeKey: `referral-rewarded:${rw.id}` });
      await this.audit.log(tx, { actorId: adminId, action: 'REFERRAL_APPROVE', targetType: 'ReferralReward', targetId: rw.id, after: { amount: rw.amount, referrerId: rw.referrerId, ledgerEntryId: entry.id, overrideDup: dupOnly ? opts.note : undefined }, ip });
      return { status: 'REWARDED' as const, checks: c };
    });
  }

  async reject(adminId: string, rewardId: string, reason: string, ip?: string) {
    if (!reason?.trim()) throw new AppError('NOTE_REQUIRED', '거절 사유를 입력해주세요.');
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.referralReward.updateMany({ where: { id: rewardId, status: 'PENDING' }, data: { status: 'REJECTED', reason: reason.trim(), decidedById: adminId, decidedAt: new Date() } });
      if (!r.count) throw Conflict('ALREADY_DECIDED', '승인 대기 건만 거절할 수 있어요.');
      await this.audit.log(tx, { actorId: adminId, action: 'REFERRAL_REJECT', targetType: 'ReferralReward', targetId: rewardId, after: { reason }, ip });
      return { status: 'REJECTED' as const };
    });
  }
}

import { ReferralController } from './referral.controller';
@Global()
@Module({ providers: [ReferralService], controllers: [ReferralController], exports: [ReferralService] })
export class ReferralModule {}
