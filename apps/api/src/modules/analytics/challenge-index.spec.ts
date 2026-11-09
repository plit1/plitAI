import { challengeIndex, cohortCompare, studyWindow } from './challenge-index';
import { kstDate } from '../../common/time';

describe('challengeIndex (데모 PLIT_AN 이관)', () => {
  it('모든 데이터가 없으면 null (데모 Jr 는 5로 대체)', () => {
    const r = challengeIndex({ avg7: null, trendPct: null, quizScore: null, progress: null, daysLeft: 30, remainingMin: 7200 });
    expect(r.value).toBeNull();
    expect(r.explanation).toHaveLength(5);
  });

  it('진도만 있으면 진도값으로 재정규화 + 5~95 클램프', () => {
    expect(challengeIndex({ avg7: null, trendPct: null, quizScore: null, progress: 0, daysLeft: 30, remainingMin: 7200 }).value).toBe(5);
    expect(challengeIndex({ avg7: null, trendPct: null, quizScore: null, progress: 100, daysLeft: 30, remainingMin: 7200 }).value).toBe(95);
    expect(challengeIndex({ avg7: null, trendPct: null, quizScore: null, progress: 40, daysLeft: 30, remainingMin: 7200 }).value).toBe(40);
  });

  it('가중 평균 계산 — 손계산 값과 일치', () => {
    // study=min(100, 41/82*100)=50, trend=50+10/2=55, quiz=70, progress=30, time: need=6000/50=120 → 41/120*100=34.17
    const r = challengeIndex({ avg7: 41, trendPct: 10, quizScore: 70, progress: 30, daysLeft: 50, remainingMin: 6000 });
    const expected = Math.round(0.3 * 50 + 0.1 * 55 + 0.25 * 70 + 0.25 * 30 + 0.1 * (41 / 120) * 100);
    expect(r.value).toBe(expected);
    expect(r.disclaimer).toContain('실제 합격 확률이 아니에요');
  });

  it('시험일이 지나면 time 구성요소 제외', () => {
    const r = challengeIndex({ avg7: 82, trendPct: null, quizScore: null, progress: null, daysLeft: 0, remainingMin: 100 });
    expect(r.components.time).toBeNull();
    expect(r.value).toBe(95);
  });
});

describe('studyWindow', () => {
  const now = new Date('2026-11-09T03:00:00Z');
  const d = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86400000);
  it('최근 7일/직전 7일 분리, 비정상 세션 제외, 일 상한 절삭', () => {
    const w = studyWindow([
      { userId: 'u', minutes: 70, endedAt: d(0) },
      { userId: 'u', minutes: 700, endedAt: d(1) }, // 1회 600분 초과 → 제외
      { userId: 'u', minutes: 500, endedAt: d(2) },
      { userId: 'u', minutes: 500, endedAt: d(2) }, // 하루 960 상한 → 960
      { userId: 'u', minutes: 35, endedAt: d(8) },
    ], now, kstDate);
    expect(w.weekMin).toBe(70 + 960);
    expect(w.prevWeekMin).toBe(35);
    expect(w.trendPct).toBeGreaterThan(0);
  });
});

describe('cohortCompare', () => {
  it('표본 10명 미만이면 비교 비공개', () => {
    expect(cohortCompare(100, [1, 2, 3]).available).toBe(false);
  });
  it('상위 10% 이내 WIN, 평균 이상 DRAW, 미만 LOSE', () => {
    const cohort = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(cohortCompare(100, cohort)).toMatchObject({ available: true, outcome: 'WIN', topPercent: 10 });
    expect(cohortCompare(60, cohort)).toMatchObject({ outcome: 'DRAW' });
    expect(cohortCompare(15, cohort)).toMatchObject({ outcome: 'LOSE' });
  });
});
