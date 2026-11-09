import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, StudySession } from '@prisma/client';
import { AppError, Conflict, NotFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { daysBetween, kstDate } from '../../common/time';
import { challengeIndex, cohortCompare, INDEX_DEFAULTS, studyWindow } from '../analytics/challenge-index';
import { EntitlementService } from '../challenges/entitlement.service';

export const STUDY_RULES = { minStudySec: 60, maxSessionMin: INDEX_DEFAULTS.maxSessionMin, maxDailyMin: INDEX_DEFAULTS.maxDailyMin };
/** 데모 GX_POLICY.pet: 기본 10XP + 10분당 5XP, 최대 60XP */
export const studyXp = (minutes: number) => Math.min(60, 10 + Math.floor(minutes / 10) * 5);

type Subject = { name: string; accuracy: number; progress: number };
type Mission = { id: string; title: string; minutes: number; done: boolean; priority?: boolean };

@Injectable()
export class StudyService {
  constructor(private readonly prisma: PrismaService, private readonly entitlements: EntitlementService) {}

  private elapsed(s: StudySession, now = new Date()) {
    return s.elapsedSec + (s.status === 'RUNNING' && s.resumedAt ? Math.floor((now.getTime() - s.resumedAt.getTime()) / 1000) : 0);
  }

  async start(userId: string, enrollmentId: string) {
    await this.entitlements.require(userId, enrollmentId, 'TODAY_STUDY');
    const open = await this.prisma.studySession.findFirst({ where: { enrollmentId, status: { in: ['RUNNING', 'PAUSED'] } } });
    if (open) return this.view(open);
    const now = new Date();
    return this.view(await this.prisma.studySession.create({ data: { userId, enrollmentId, startedAt: now, resumedAt: now } }));
  }

  private async own(userId: string, sessionId: string) {
    const s = await this.prisma.studySession.findUnique({ where: { id: sessionId } });
    if (!s || s.userId !== userId) throw NotFound('공부 세션');
    return s;
  }

  async pause(userId: string, sessionId: string) {
    const s = await this.own(userId, sessionId);
    if (s.status !== 'RUNNING') return this.view(s);
    return this.view(await this.prisma.studySession.update({ where: { id: s.id }, data: { status: 'PAUSED', elapsedSec: this.elapsed(s), resumedAt: null } }));
  }

  async resume(userId: string, sessionId: string) {
    const s = await this.own(userId, sessionId);
    if (s.status !== 'PAUSED') return this.view(s);
    return this.view(await this.prisma.studySession.update({ where: { id: s.id }, data: { status: 'RUNNING', resumedAt: new Date() } }));
  }

  async cancel(userId: string, sessionId: string) {
    const s = await this.own(userId, sessionId);
    if (s.status === 'COMPLETED') throw Conflict('ALREADY_COMPLETED', '이미 기록된 공부예요.');
    return this.view(await this.prisma.studySession.update({ where: { id: s.id }, data: { status: 'CANCELLED', endedAt: new Date() } }));
  }

  /** 공부 완료 → 학습기록 갱신 (데모 H6) + XP. 세션 상태 조건부 전이로 중복 반영 방지 */
  async complete(userId: string, sessionId: string) {
    const s = await this.own(userId, sessionId);
    if (s.status === 'COMPLETED') throw Conflict('ALREADY_RECORDED', '이미 반영된 학습 기록이에요.');
    if (s.status !== 'RUNNING' && s.status !== 'PAUSED') throw Conflict('SESSION_CLOSED', '진행 중인 공부가 없어요.');
    const now = new Date();
    const sec = this.elapsed(s, now);
    if (sec < STUDY_RULES.minStudySec) throw new AppError('TOO_SHORT', '1분 이상 공부해야 기록돼요.');
    let minutes = Math.floor(sec / 60);
    if (minutes > STUDY_RULES.maxSessionMin) {
      // 비정상 세션: 집계에서 제외되도록 INVALID 로 확정 (트랜잭션 밖 — 예외로 롤백되지 않게)
      await this.prisma.studySession.updateMany({ where: { id: s.id, status: { in: ['RUNNING', 'PAUSED'] } }, data: { status: 'INVALID', endedAt: now, elapsedSec: sec, minutes } });
      throw new AppError('SESSION_TOO_LONG', `1회 공부는 최대 ${STUDY_RULES.maxSessionMin}분까지 기록돼요. 타이머를 확인해주세요.`, HttpStatus.UNPROCESSABLE_ENTITY);
    }

    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.studySession.updateMany({ where: { id: s.id, status: { in: ['RUNNING', 'PAUSED'] } }, data: { status: 'COMPLETED' } });
      if (count === 0) throw Conflict('ALREADY_RECORDED', '이미 반영된 학습 기록이에요.');

      const today = kstDate(now);
      const startOfDay = new Date(Date.parse(today + 'T00:00:00+09:00'));
      const todaySum = await tx.studySession.aggregate({ where: { userId, status: 'COMPLETED', endedAt: { gte: startOfDay }, id: { not: s.id } }, _sum: { minutes: true } });
      minutes = Math.max(0, Math.min(minutes, STUDY_RULES.maxDailyMin - (todaySum._sum.minutes ?? 0)));
      await tx.studySession.update({ where: { id: s.id }, data: { endedAt: now, elapsedSec: sec, minutes } });

      const rec = await tx.studyRecord.findUniqueOrThrow({ where: { enrollmentId: s.enrollmentId } });
      const subjects = rec.subjects as Subject[];
      const missions = rec.missions as Mission[];
      let cleared: string | null = null;
      const nextMissions = missions.map((m) => (!cleared && !m.done ? ((cleared = m.title), { ...m, done: true }) : m));
      const weakest = rec.accuracy == null ? null : [...subjects].sort((a, b) => a.accuracy - b.accuracy)[0];
      const target = weakest ?? subjects[0];
      const nextSubjects = subjects.map((x) => (target && x.name === target.name ? { ...x, progress: Math.min(100, x.progress + Math.round((minutes / 60) * 2)) } : x));
      const streakUp = rec.lastStudyDate !== today;
      const updated = await tx.studyRecord.update({
        where: { id: rec.id },
        data: {
          totalMin: { increment: minutes }, progress: Math.min(100, Math.round((rec.progress + minutes / 60) * 10) / 10),
          streak: streakUp ? rec.streak + 1 : rec.streak, lastStudyDate: today,
          missions: nextMissions as unknown as Prisma.InputJsonValue, subjects: nextSubjects as unknown as Prisma.InputJsonValue,
        },
      });
      const xp = minutes > 0 ? studyXp(minutes) : 0;
      if (xp > 0) await tx.xpLedgerEntry.create({ data: { userId, deltaXp: xp, sourceType: 'study', sourceId: s.id, eventKey: `study:${s.id}` } });
      if (streakUp && updated.streak > 0 && updated.streak % 7 === 0) {
        await tx.xpLedgerEntry.upsert({ where: { eventKey: `streak7:${s.enrollmentId}:${updated.streak}` }, create: { userId, deltaXp: 80, sourceType: 'streak', sourceId: s.enrollmentId, eventKey: `streak7:${s.enrollmentId}:${updated.streak}` }, update: {} });
      }
      return { minutes, xp, missionCleared: cleared, streak: updated.streak, progress: updated.progress };
    });
  }

  view(s: StudySession) {
    return { id: s.id, enrollmentId: s.enrollmentId, status: s.status, startedAt: s.startedAt, elapsedSec: this.elapsed(s), minutes: s.minutes };
  }

  /** 지표 계산 입력 (대시보드·QUICK TEST·전략 공용) */
  async snapshot(enrollmentId: string) {
    const enrollment = await this.prisma.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
    const [rec, offering, mine] = await Promise.all([
      this.prisma.studyRecord.findUniqueOrThrow({ where: { enrollmentId } }),
      this.prisma.challengeOffering.findUniqueOrThrow({ where: { id: enrollment.offeringId }, include: { cert: true } }),
      this.prisma.studySession.findMany({ where: { enrollmentId, status: 'COMPLETED', endedAt: { gte: new Date(Date.now() - 14 * 86400000) } }, select: { userId: true, minutes: true, endedAt: true } }),
    ]);
    const now = new Date();
    return { enrollment, rec, offering, w: studyWindow(mine.map((m) => ({ userId: m.userId, minutes: m.minutes ?? 0, endedAt: m.endedAt! })), now, kstDate), daysLeft: daysBetween(now, offering.examDate) };
  }

  /** quizScore 를 바꿔 넣으면 QUICK TEST 전후 비교에 사용 */
  indexFor(snap: Awaited<ReturnType<StudyService['snapshot']>>, quizScore: number | null = snap.rec.accuracy) {
    return challengeIndex({
      avg7: snap.w.avg7, trendPct: snap.w.trendPct, quizScore, quizSource: 'QUICK TEST', progress: Math.floor(snap.rec.progress),
      daysLeft: snap.daysLeft, remainingMin: Math.max(0, INDEX_DEFAULTS.requiredTotalMin - snap.rec.totalMin),
    });
  }

  /** 대시보드: 학습기록 + PLIT 도전 지표(추정) + 회차 내 비교 */
  async dashboard(userId: string, enrollmentId: string) {
    const { enrollment, plan } = await this.entitlements.require(userId, enrollmentId, 'BASIC_PROBABILITY');
    const [snap, open] = await Promise.all([
      this.snapshot(enrollmentId),
      this.prisma.studySession.findFirst({ where: { enrollmentId, status: { in: ['RUNNING', 'PAUSED'] } } }),
    ]);
    const { rec, offering, w, daysLeft } = snap;
    const now = new Date();
    const index = this.indexFor(snap);

    // 비교 모집단: 같은 회차 참가자 (FREE/PREMIUM 모두, 테스트·탈퇴 계정 제외). 집계값만 반환.
    const since = new Date(now.getTime() - 7 * 86400000);
    const cohort = await this.prisma.$queryRaw<{ userId: string; m: bigint }[]>`
      SELECT e."userId", COALESCE(SUM(LEAST(s."minutes", ${STUDY_RULES.maxSessionMin})), 0) AS m
      FROM "Enrollment" e JOIN "User" u ON u."id" = e."userId"
      LEFT JOIN "StudySession" s ON s."enrollmentId" = e."id" AND s."status" = 'COMPLETED' AND s."endedAt" >= ${since}
      WHERE e."offeringId" = ${offering.id} AND e."status" = 'ACTIVE' AND u."isTest" = false AND u."status" = 'ACTIVE'
      GROUP BY e."userId"`;
    const compare = cohortCompare(w.weekMin, cohort.map((c) => Number(c.m)));
    const comparison = plan === 'PREMIUM' || !compare.available ? compare : { available: true, sample: compare.sample, average: compare.average, outcome: compare.outcome, topPercent: null, note: '상세 순위는 플릿 부스터 패스에서 볼 수 있어요' };

    return {
      enrollmentId, plan, cert: { id: offering.cert.id, name: offering.cert.name }, round: offering.round, examDate: offering.examDate, daysLeft,
      record: { progress: rec.progress, totalMin: rec.totalMin, weekMin: w.weekMin, streak: rec.streak, lastStudyDate: rec.lastStudyDate, accuracy: rec.accuracy, expectedScore: rec.expectedScore, subjects: rec.subjects, missions: rec.missions, clearModeStarted: rec.clearModeStarted, appliedPlan: rec.appliedPlan },
      recommendedDailyMin: INDEX_DEFAULTS.targetDailyMin,
      index, comparison, openSession: open ? this.view(open) : null,
    };
  }
}
