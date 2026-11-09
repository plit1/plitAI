import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, StudySession } from '@prisma/client';
import { AppError, Conflict, NotFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { daysBetween, kstDate } from '../../common/time';
import { challengeIndex, competitionView, INDEX_DEFAULTS, studyWindow } from '../analytics/challenge-index';
import { EntitlementService } from '../challenges/entitlement.service';
import { XpEvent, XpService } from '../gamification/xp.service';
import { ReferralService } from '../referral/referral.service';

export const STUDY_RULES = { minStudySec: 60, maxSessionMin: INDEX_DEFAULTS.maxSessionMin, maxDailyMin: INDEX_DEFAULTS.maxDailyMin };
/** 데모 GX_POLICY.pet: 기본 10XP + 10분당 5XP, 최대 60XP */
export const studyXp = (minutes: number) => Math.min(60, 10 + Math.floor(minutes / 10) * 5);

type Subject = { name: string; accuracy: number; progress: number };
type Mission = { id: string; title: string; minutes: number; done: boolean; priority?: boolean };

@Injectable()
export class StudyService {
  constructor(private readonly prisma: PrismaService, private readonly entitlements: EntitlementService, private readonly xp: XpService, private readonly referral: ReferralService) {}

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
      const events: XpEvent[] = xp > 0 ? [{ eventKey: `study:${s.id}`, sourceType: 'study', sourceId: s.id, deltaXp: xp }] : [];
      if (streakUp && updated.streak > 0 && updated.streak % 7 === 0) events.push({ eventKey: `streak7:${s.enrollmentId}:${updated.streak}`, sourceType: 'streak', sourceId: s.enrollmentId, deltaXp: 80 });
      const xpResult = await this.xp.award(tx, userId, events);
      await this.referral.onValidStudy(tx, userId, s.enrollmentId, s.id); // 초대받은 회원의 첫 유효 학습 → 보상 승인 대기
      return { minutes, xp, missionCleared: cleared, streak: updated.streak, progress: updated.progress, levelUp: xpResult.levelAfter > xpResult.levelBefore ? xpResult.levelAfter : null };
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

  /**
   * 회차 경쟁 뷰 입력: 같은 회차 참가자(취소 제외·테스트/탈퇴 계정 제외)의 KST 일별 학습 분, 참여일, 누적.
   * 집계만 반환하며 타인 원천 기록은 응답에 포함하지 않는다.
   */
  async competition(offeringId: string, meId: string, now = new Date()) {
    const today = kstDate(now);
    const since = new Date(Date.parse(`${today}T00:00:00+09:00`) - 6 * 86400000);
    const [enrs, daily] = await Promise.all([
      this.prisma.enrollment.findMany({ where: { offeringId, status: { not: 'CANCELLED' }, user: { isTest: false, status: 'ACTIVE' } }, select: { userId: true, joinedAt: true, record: { select: { totalMin: true } } } }),
      this.prisma.$queryRaw<{ userId: string; day: string; m: bigint }[]>`
        SELECT s."userId", to_char(s."endedAt" AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS day, SUM(s."minutes") AS m
        FROM "StudySession" s JOIN "Enrollment" e ON e."id" = s."enrollmentId"
        WHERE e."offeringId" = ${offeringId} AND s."status" = 'COMPLETED' AND s."endedAt" >= ${since}
        GROUP BY s."userId", day`,
    ]);
    const byUser = new Map<string, Record<string, number>>();
    for (const d of daily) { const m = byUser.get(d.userId) ?? {}; m[d.day] = Number(d.m); byUser.set(d.userId, m); }
    const rows = enrs.map((e) => ({ userId: e.userId, enrolledDay: kstDate(e.joinedAt), daily: byUser.get(e.userId) ?? {}, cumulative: e.record?.totalMin ?? 0 }));
    return competitionView(rows, meId, today);
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

    const comp = await this.competition(offering.id, userId);
    // 플릿런: WIN/DRAW/LOSE·평균 비교까지 / 부스터: 상세 순위 포함
    const comparison = plan === 'PREMIUM' ? comp : { ...comp, ranks: null, rankNote: '상세 순위는 플릿 부스터 패스에서 볼 수 있어요' };

    return {
      enrollmentId, offeringId: offering.id, plan, cert: { id: offering.cert.id, name: offering.cert.name }, round: offering.round, examDate: offering.examDate, daysLeft,
      record: { progress: rec.progress, totalMin: rec.totalMin, weekMin: w.weekMin, streak: rec.streak, lastStudyDate: rec.lastStudyDate, accuracy: rec.accuracy, expectedScore: rec.expectedScore, subjects: rec.subjects, missions: rec.missions, clearModeStarted: rec.clearModeStarted, appliedPlan: rec.appliedPlan },
      recommendedDailyMin: INDEX_DEFAULTS.targetDailyMin,
      index, comparison, openSession: open ? this.view(open) : null,
    };
  }
}
