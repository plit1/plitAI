import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { EntitlementService } from '../challenges/entitlement.service';
import { StudyService } from '../study/study.service';
import { AiCoachService } from './ai-coach.service';
import { CoachFacts } from './ai-coach.rules';
import { applyPlan, clearModeAllocation, clearModeAvailable, Mission, remainingPace, STRATEGY, Subject, weakest, weeklyGap } from './strategy.rules';

@Injectable()
export class StrategyService {
  constructor(private readonly prisma: PrismaService, private readonly entitlements: EntitlementService, private readonly study: StudyService, private readonly coachSvc: AiCoachService) {}

  /** AI 학습전략 화면: 규칙으로 계산한 계획 (부스터 패스 전용) */
  async view(userId: string, enrollmentId: string) {
    await this.entitlements.require(userId, enrollmentId, 'AI_STRATEGY');
    const snap = await this.study.snapshot(enrollmentId);
    const subjects = snap.rec.subjects as unknown as Subject[];
    const gap = weeklyGap(snap.w.weekMin);
    const plan = applyPlan({ subjects, accuracy: snap.rec.accuracy, missions: snap.rec.missions as unknown as Mission[], appliedPlan: snap.rec.appliedPlan as { key: string } | null }, snap.w.weekMin, new Date().toISOString());
    const recommended = (snap.rec.appliedPlan as { recommended?: number } | null)?.recommended ?? STRATEGY.baseRecommendedMin;
    return {
      daysLeft: snap.daysLeft, weekMin: snap.w.weekMin, weekRequiredMin: STRATEGY.weekRequiredMin,
      gap, weakest: weakest(subjects, snap.rec.accuracy), pace: remainingPace(snap.rec.totalMin, snap.daysLeft),
      applied: snap.rec.appliedPlan, upToDate: !plan.changed, previewMissions: plan.changed ? plan.missions : snap.rec.missions,
      clearMode: { available: clearModeAvailable(snap.daysLeft), started: snap.rec.clearModeStarted, allocation: clearModeAllocation(recommended) },
    };
  }

  /** 계획 적용 (같은 부족분이면 변경 없음 — 데모 G6) */
  async apply(userId: string, enrollmentId: string) {
    await this.entitlements.require(userId, enrollmentId, 'AI_STRATEGY');
    const snap = await this.study.snapshot(enrollmentId);
    const r = applyPlan({ subjects: snap.rec.subjects as unknown as Subject[], accuracy: snap.rec.accuracy, missions: snap.rec.missions as unknown as Mission[], appliedPlan: snap.rec.appliedPlan as { key: string } | null }, snap.w.weekMin, new Date().toISOString());
    if (!r.changed) return { changed: false, recommended: r.gap.newRecommended };
    await this.prisma.studyRecord.update({ where: { id: snap.rec.id }, data: { missions: r.missions as unknown as Prisma.InputJsonValue, appliedPlan: r.appliedPlan as unknown as Prisma.InputJsonValue } });
    return { changed: true, recommended: r.gap.newRecommended, missions: r.missions };
  }

  /** CLEAR MODE 시작: 부스터 + 시험 D-7 이하 */
  async startClearMode(userId: string, enrollmentId: string) {
    await this.entitlements.require(userId, enrollmentId, 'CLEAR_MODE');
    const snap = await this.study.snapshot(enrollmentId);
    if (!clearModeAvailable(snap.daysLeft)) throw new AppError('CLEAR_MODE_NOT_YET', `CLEAR MODE 는 시험 ${STRATEGY.clearModeDays}일 전부터 시작할 수 있어요.`);
    await this.prisma.studyRecord.update({ where: { id: snap.rec.id }, data: { clearModeStarted: true } });
    const recommended = (snap.rec.appliedPlan as { recommended?: number } | null)?.recommended ?? STRATEGY.baseRecommendedMin;
    return { started: true, allocation: clearModeAllocation(recommended) };
  }

  /** AI 코칭 메시지: 서버 계산 사실 → LLM 설명 (검증 실패·한도·오류 시 규칙 문장) */
  async coach(userId: string, enrollmentId: string) {
    const { plan } = await this.entitlements.require(userId, enrollmentId, 'AI_STRATEGY');
    const snap = await this.study.snapshot(enrollmentId);
    const subjects = snap.rec.subjects as unknown as Subject[];
    const w = snap.rec.accuracy == null ? null : weakest(subjects, snap.rec.accuracy);
    const facts: CoachFacts = {
      certName: snap.offering.cert.name, daysLeft: snap.daysLeft, weekMin: snap.w.weekMin, weekRequiredMin: STRATEGY.weekRequiredMin,
      todayRecommendedMin: weeklyGap(snap.w.weekMin).newRecommended, streak: snap.rec.streak, progress: snap.rec.progress, accuracy: snap.rec.accuracy,
      weakestSubject: w?.name ?? null, weakestAccuracy: w?.accuracy ?? null, indexValue: this.study.indexFor(snap).value, clearMode: snap.rec.clearModeStarted,
    };
    return this.coachSvc.coach(userId, plan, facts);
  }
}
