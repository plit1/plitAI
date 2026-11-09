import { HttpStatus, Injectable } from '@nestjs/common';
import { Plan, Prisma } from '@prisma/client';
import { AppError, Conflict, NotFound } from '../../common/errors';
import { PrismaService, Tx } from '../../common/prisma.service';
import { daysBetween } from '../../common/time';
import { PolicyService } from '../policy/policy.service';
import { EntitlementService } from './entitlement.service';
import { initialRecord } from './study-record.factory';

const PLAN_LABEL: Record<Plan, string> = { FREE: '플릿런', PREMIUM: '플릿 부스터 패스' };

@Injectable()
export class ChallengesService {
  constructor(private readonly prisma: PrismaService, private readonly policy: PolicyService, private readonly entitlements: EntitlementService) {}

  async list(params: { certId?: string; status?: 'open' | 'closed'; field?: string }) {
    const where: Prisma.ChallengeOfferingWhereInput = { hidden: false };
    if (params.certId) where.certId = params.certId;
    if (params.status) where.status = params.status;
    if (params.field) where.cert = { field: params.field };
    const rows = await this.prisma.challengeOffering.findMany({ where, include: { cert: true }, orderBy: [{ popularity: 'desc' }, { recruitEnd: 'asc' }] });
    return rows.map((o) => this.view(o));
  }

  view(o: Prisma.ChallengeOfferingGetPayload<{ include: { cert: true } }>) {
    const now = new Date();
    return {
      id: o.id, certId: o.certId, certName: o.cert.name, field: o.cert.field, round: o.round, status: this.effectiveStatus(o, now),
      recruitEnd: o.recruitEnd, examDate: o.examDate, durationDays: o.durationDays,
      recruitDaysLeft: daysBetween(now, o.recruitEnd), examDaysLeft: daysBetween(now, o.examDate),
      free: { cap: o.freeCap, joined: o.freeJoined, remaining: Math.max(0, o.freeCap - o.freeJoined) },
      premium: { cap: o.premiumCap, joined: o.premiumJoined, remaining: Math.max(0, o.premiumCap - o.premiumJoined) },
      popularity: o.popularity,
    };
  }

  private effectiveStatus(o: { status: string; recruitEnd: Date }, now: Date) {
    return o.status === 'open' && daysBetween(now, o.recruitEnd) < 0 ? 'closed' : o.status;
  }

  async detail(id: string) {
    const o = await this.prisma.challengeOffering.findUnique({ where: { id }, include: { cert: true } });
    if (!o || o.hidden) throw NotFound('챌린지');
    const { values, version } = await this.policy.current();
    return { ...this.view(o), cert: o.cert, policy: { version, passPrice: values.passPrice, rewards: { FREE: values.togetherReward, PREMIUM: values.boosterReward } } };
  }

  /**
   * 챌린지 참여. 하나의 트랜잭션에서
   *  1) 모집 상태/마감 확인 2) 중복 참여 확인 3) PREMIUM 은 해당 회차 유효 패스 확인
   *  4) 정원 카운터 조건부 증가(UPDATE ... WHERE joined < cap) → 동시 신청에도 정원 초과 불가
   *  5) 참여·학습기록 생성 (정책 버전·보상 스냅샷 기록)
   */
  async join(userId: string, offeringId: string, plan: Plan, referralCode?: string) {
    return this.prisma.$transaction(async (tx) => {
      const o = await tx.challengeOffering.findUnique({ where: { id: offeringId }, include: { cert: true } });
      if (!o || o.hidden) throw NotFound('챌린지');
      if (o.status !== 'open' || daysBetween(new Date(), o.recruitEnd) < 0) throw new AppError('RECRUIT_CLOSED', '모집이 마감된 챌린지예요.');
      if (await tx.enrollment.findUnique({ where: { userId_offeringId: { userId, offeringId } } })) throw Conflict('ALREADY_JOINED', '이미 참여 중인 챌린지예요.');

      let passId: string | null = null;
      if (plan === 'PREMIUM') {
        const pass = await this.entitlements.findActivePass(tx, userId, offeringId);
        if (!pass) throw new AppError('PASS_REQUIRED', '이 시험 회차의 플릿 부스터 패스가 필요해요.', HttpStatus.PAYMENT_REQUIRED);
        passId = pass.id;
      }
      await this.reserveSeat(tx, offeringId, plan);

      const { version, values } = await this.policy.current(tx);
      const enrollment = await tx.enrollment.create({
        data: { userId, offeringId, certId: o.certId, plan, policyVersion: version, rewardSnapshot: this.policy.rewardFor(values, plan), passId, referralCode: referralCode?.toUpperCase() },
      });
      await tx.studyRecord.create({ data: { enrollmentId: enrollment.id, userId, ...initialRecord(o.cert.subjects, plan) } });
      return { enrollment, message: `${o.cert.name} ${PLAN_LABEL[plan]} 챌린지를 시작해요.` };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  async reserveSeat(tx: Tx, offeringId: string, plan: Plan) {
    const updated = plan === 'FREE'
      ? await tx.$executeRaw`UPDATE "ChallengeOffering" SET "freeJoined" = "freeJoined" + 1 WHERE "id" = ${offeringId} AND "freeJoined" < "freeCap"`
      : await tx.$executeRaw`UPDATE "ChallengeOffering" SET "premiumJoined" = "premiumJoined" + 1 WHERE "id" = ${offeringId} AND "premiumJoined" < "premiumCap"`;
    if (updated === 0) throw Conflict('CAPACITY_FULL', `${PLAN_LABEL[plan]} 정원이 마감됐어요.`);
  }

  async releaseSeat(tx: Tx, offeringId: string, plan: Plan) {
    if (plan === 'FREE') await tx.$executeRaw`UPDATE "ChallengeOffering" SET "freeJoined" = GREATEST(0, "freeJoined" - 1) WHERE "id" = ${offeringId}`;
    else await tx.$executeRaw`UPDATE "ChallengeOffering" SET "premiumJoined" = GREATEST(0, "premiumJoined" - 1) WHERE "id" = ${offeringId}`;
  }

  /** 결제 완료 시: 이미 플릿런으로 참여 중이면 부스터로 전환 (정원 이동) */
  async upgradeToPremium(tx: Tx, userId: string, offeringId: string, passId: string) {
    const e = await tx.enrollment.findUnique({ where: { userId_offeringId: { userId, offeringId } } });
    if (!e || e.plan === 'PREMIUM' || e.status !== 'ACTIVE') return null;
    await this.reserveSeat(tx, offeringId, 'PREMIUM');
    await this.releaseSeat(tx, offeringId, 'FREE');
    const { values } = await this.policy.current(tx);
    await tx.enrollmentPlanChange.create({ data: { enrollmentId: e.id, fromPlan: 'FREE', toPlan: 'PREMIUM', reason: '플릿 부스터 패스 결제' } });
    return tx.enrollment.update({ where: { id: e.id }, data: { plan: 'PREMIUM', passId, rewardSnapshot: values.boosterReward } });
  }

  /** 환불 시: 부스터 → 플릿런 다운그레이드 (데모 downgrade) */
  async downgradeToFree(tx: Tx, passId: string, reason: string) {
    const e = await tx.enrollment.findUnique({ where: { passId } });
    if (!e) return null;
    await this.releaseSeat(tx, e.offeringId, 'PREMIUM');
    await tx.$executeRaw`UPDATE "ChallengeOffering" SET "freeJoined" = "freeJoined" + 1 WHERE "id" = ${e.offeringId}`; // 기존 참여자는 정원 초과여도 유지
    const { values } = await this.policy.current(tx);
    await tx.enrollmentPlanChange.create({ data: { enrollmentId: e.id, fromPlan: 'PREMIUM', toPlan: 'FREE', reason } });
    return tx.enrollment.update({ where: { id: e.id }, data: { plan: 'FREE', passId: null, rewardSnapshot: Math.min(e.rewardSnapshot, values.togetherReward) } });
  }

  async myEnrollments(userId: string) {
    const rows = await this.prisma.enrollment.findMany({
      where: { userId }, orderBy: { joinedAt: 'desc' },
      include: { offering: { include: { cert: true } }, record: true, verification: { select: { status: true, note: true, submittedAt: true } } },
    });
    return Promise.all(rows.map(async (e) => ({
      id: e.id, plan: e.plan, effectivePlan: await this.entitlements.effectivePlan(e), status: e.status, joinedAt: e.joinedAt,
      rewardSnapshot: e.rewardSnapshot, policyVersion: e.policyVersion,
      offering: this.view(e.offering),
      record: e.record ? { progress: e.record.progress, totalMin: e.record.totalMin, streak: e.record.streak } : null,
      verification: e.verification,
    })));
  }
}
