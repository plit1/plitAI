import { HttpStatus, Injectable } from '@nestjs/common';
import { VerificationStatus } from '@prisma/client';
import { AppError, Conflict, NotFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { daysBetween } from '../../common/time';
import { AuditService } from '../admin/audit.service';
import { EntitlementService } from '../challenges/entitlement.service';
import { PointsService } from '../points/points.service';
import { XpService } from '../gamification/xp.service';
import { NotificationsService } from '../notifications/notifications.service';

export type ReviewDecision = 'APPROVE' | 'NEEDS_FIX' | 'FAIL' | 'REJECT';
const LOCKED: VerificationStatus[] = ['REVIEWING', 'APPROVED', 'FAILED'];
const CLEAR_XP = 150;

/** 수험번호는 뒤 4자리만 보관 (개인정보 최소 수집) + 중복 탐지용 해시 */
export function maskExamNumber(raw: string) {
  const digits = raw.replace(/\s|-/g, '');
  return digits.length <= 4 ? '*'.repeat(digits.length) : '*'.repeat(digits.length - 4) + digits.slice(-4);
}

@Injectable()
export class VerificationsService {
  constructor(private readonly prisma: PrismaService, private readonly entitlements: EntitlementService, private readonly points: PointsService, private readonly audit: AuditService, private readonly xp: XpService, private readonly notifications: NotificationsService) {}

  /** 공식 개인 합격조회 API 가 확인되지 않아 자동 검증을 가정하지 않는다 → 증빙 + 관리자 심사 */
  async submit(userId: string, enrollmentId: string, input: { examNumber: string; evidenceKey: string; examRoundId?: string }) {
    const { enrollment } = await this.entitlements.require(userId, enrollmentId, 'VERIFICATION');
    const offering = await this.prisma.challengeOffering.findUniqueOrThrow({ where: { id: enrollment.offeringId } });
    if (daysBetween(new Date(), offering.examDate) > 0) throw new AppError('EXAM_NOT_FINISHED', '시험 종료 후 제출할 수 있어요.');
    if (!input.evidenceKey.startsWith(`evidence/${userId}/`)) throw new AppError('INVALID_EVIDENCE', '증빙 파일을 다시 올려주세요.');
    if (input.examRoundId) {
      const round = await this.prisma.examRound.findUnique({ where: { id: input.examRoundId } });
      if (!round || round.certId !== enrollment.certId) throw new AppError('INVALID_EXAM_ROUND', '이 자격증의 시험 회차를 선택해주세요.');
    }
    const masked = maskExamNumber(input.examNumber);
    const existing = await this.prisma.passVerification.findUnique({ where: { enrollmentId } });
    if (existing && LOCKED.includes(existing.status)) throw Conflict('ALREADY_SUBMITTED', '이미 제출된 결과예요.');

    const dup = await this.prisma.passVerification.findFirst({
      where: { examNumber: masked, enrollment: { certId: enrollment.certId, offeringId: enrollment.offeringId }, userId: { not: userId }, status: { in: ['REVIEWING', 'APPROVED'] } },
    });
    const note = dup ? '[자동 표시] 같은 회차에 끝자리가 같은 수험번호가 있어요 — 심사 시 확인 필요' : null;

    const data = { examNumber: masked, evidenceKey: input.evidenceKey, examRoundId: input.examRoundId ?? null, status: 'REVIEWING' as const, note, submittedAt: new Date(), reviewerId: null, reviewedAt: null };
    const v = existing
      ? await this.prisma.passVerification.update({ where: { id: existing.id }, data })
      : await this.prisma.passVerification.create({ data: { ...data, enrollmentId, userId } });
    return { id: v.id, status: v.status, message: '결과를 제출했어요. 검토가 끝나면 알려드릴게요.' };
  }

  async appeal(userId: string, enrollmentId: string, reason: string) {
    const v = await this.prisma.passVerification.findUnique({ where: { enrollmentId } });
    if (!v || v.userId !== userId) throw NotFound('합격 인증');
    if (v.status !== 'REJECTED' && v.status !== 'FAILED') throw Conflict('NOT_APPEALABLE', '이의신청할 수 있는 상태가 아니에요.');
    if (v.status === 'FAILED' && (await this.prisma.pointLedgerEntry.findUnique({ where: { dedupeKey: `reward:${enrollmentId}` } }))) throw Conflict('NOT_APPEALABLE', '이미 보상이 처리됐어요.');
    await this.prisma.passVerification.update({ where: { id: v.id }, data: { status: 'REVIEWING', note: `[이의신청] ${reason.slice(0, 500)}` } });
    return { ok: true };
  }

  async mine(userId: string, enrollmentId: string) {
    const v = await this.prisma.passVerification.findUnique({ where: { enrollmentId } });
    if (!v || v.userId !== userId) return { status: 'none' };
    return { id: v.id, status: v.status, examNumber: v.examNumber, note: v.status === 'NEEDS_FIX' || v.status === 'REJECTED' ? v.note : null, submittedAt: v.submittedAt, reviewedAt: v.reviewedAt };
  }

  /** 심사자 증빙 열람: 개인정보 접근이므로 열람마다 감사 로그 */
  async evidenceFor(adminId: string, verificationId: string, read: (key: string) => Promise<{ body: Buffer; contentType: string } | null>, ip?: string) {
    const v = await this.prisma.passVerification.findUnique({ where: { id: verificationId } });
    if (!v || !v.evidenceKey) throw NotFound('증빙');
    const file = await read(v.evidenceKey);
    if (!file) throw NotFound('증빙 파일');
    await this.prisma.$transaction((tx) => this.audit.log(tx, { actorId: adminId, action: 'EVIDENCE_VIEW', targetType: 'PassVerification', targetId: v.id, after: { key: v.evidenceKey }, ip }));
    return file;
  }

  async queue(status: VerificationStatus = 'REVIEWING') {
    const rows = await this.prisma.passVerification.findMany({
      where: { status }, orderBy: { submittedAt: 'asc' }, take: 100,
      include: { user: { select: { id: true, nickname: true } }, enrollment: { select: { plan: true, certId: true, offeringId: true, rewardSnapshot: true } } },
    });
    const roundIds = rows.map((r) => r.examRoundId).filter((x): x is string => !!x);
    const rounds = new Map((roundIds.length ? await this.prisma.examRound.findMany({ where: { id: { in: roundIds } } }) : []).map((r) => [r.id, r]));
    return rows.map((r) => ({ ...r, hasEvidence: !!r.evidenceKey, examRound: r.examRoundId ? { label: rounds.get(r.examRoundId)?.label ?? null, resultDate: rounds.get(r.examRoundId)?.resultDate ?? null } : null }));
  }

  /**
   * 관리자 심사. 승인 시 참여 시점 보상(rewardSnapshot)을 원장에 1회 지급 (dedupeKey reward:{enrollmentId}).
   * REWARDS_LIVE=false 이면 원장 행이 isVirtual=true 로 기록됨 (가상 포인트).
   */
  async review(adminId: string, verificationId: string, decision: ReviewDecision, note: string | undefined, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      const [v] = await tx.$queryRaw<{ id: string; status: VerificationStatus; enrollmentId: string; userId: string }[]>`SELECT "id","status","enrollmentId","userId" FROM "PassVerification" WHERE "id" = ${verificationId} FOR UPDATE`;
      if (!v) throw NotFound('합격 인증');
      if (v.status !== 'REVIEWING') throw Conflict('NOT_REVIEWING', '검토 중인 결과가 아니에요.');
      if (v.userId === adminId) throw new AppError('SELF_REVIEW', '본인 인증은 심사할 수 없어요.', HttpStatus.FORBIDDEN);
      const e = await tx.enrollment.findUniqueOrThrow({ where: { id: v.enrollmentId }, include: { offering: { include: { cert: true } } } });
      const next: VerificationStatus = { APPROVE: 'APPROVED', NEEDS_FIX: 'NEEDS_FIX', FAIL: 'FAILED', REJECT: 'REJECTED' }[decision] as VerificationStatus;
      if ((decision === 'NEEDS_FIX' || decision === 'REJECT') && !note) throw new AppError('NOTE_REQUIRED', '보완·반려 사유를 입력해주세요.');
      await tx.passVerification.update({ where: { id: v.id }, data: { status: next, note: note ?? null, reviewerId: adminId, reviewedAt: new Date() } });

      let reward = 0;
      const label = `${e.offering.cert.name} (${e.plan === 'PREMIUM' ? '플릿 부스터 패스' : '플릿런'})`;
      if (decision === 'APPROVE') {
        reward = e.rewardSnapshot;
        await this.points.post(tx, { userId: v.userId, type: 'EARN', amount: reward, reason: `${label} 합격 승인`, dedupeKey: `reward:${e.id}`, refType: 'PassVerification', refId: v.id, createdById: adminId });
        await this.xp.award(tx, v.userId, [{ eventKey: `clear:${e.id}`, sourceType: 'clear', sourceId: e.id, deltaXp: CLEAR_XP }]);
        await tx.enrollment.update({ where: { id: e.id }, data: { status: 'COMPLETED' } });
      } else if (decision === 'FAIL') {
        await this.points.post(tx, { userId: v.userId, type: 'RESULT', amount: 0, reason: `${label} 불합격 확인 · 합격 보상 0P`, dedupeKey: `fail:${e.id}`, refType: 'PassVerification', refId: v.id, createdById: adminId });
      }
      const MSG: Record<string, [string, string]> = {
        APPROVE: ['합격 인증이 승인됐어요', `${label} 합격 보상 ${reward.toLocaleString('ko-KR')}P가 적립됐어요.`],
        NEEDS_FIX: ['합격 인증 보완이 필요해요', note ?? ''], FAIL: ['합격 인증 결과를 확인했어요', `${label} 결과가 반영됐어요.`], REJECT: ['합격 인증이 반려됐어요', note ?? ''],
      };
      await this.notifications.notify(tx, { userId: v.userId, type: 'VERIFICATION_DECIDED', title: MSG[decision][0], body: MSG[decision][1], link: `/verify/${e.id}`, dedupeKey: `verification:${v.id}:${decision}:${Date.now()}` });
      await this.audit.log(tx, { actorId: adminId, action: `VERIFICATION_${decision}`, targetType: 'PassVerification', targetId: v.id, before: { status: v.status }, after: { status: next, reward, note }, ip });
      return { id: v.id, status: next, reward };
    });
  }
}
