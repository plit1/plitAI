import { challengeIndex, classifyWdl, competitionRank, competitionView, studyWindow } from './challenge-index';
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

describe('competitionView (데모 computeView 이관)', () => {
  const today = '2026-11-09';
  const days = (n: number, min: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [new Date(Date.parse(`${today}T00:00:00Z`) - i * 86400000).toISOString().slice(0, 10), min]));
  const cohort = (mins: number[]) => mins.map((m, i) => ({ userId: `u${i}`, enrolledDay: '2026-10-01', daily: days(7, m), cumulative: m * 7 }));

  it('표본 10명 미만이면 판정 보류(COLLECTING)·순위 없음', () => {
    const v = competitionView(cohort([60, 60, 60]), 'u0', today);
    expect(v.wdl).toMatchObject({ status: 'UNAVAILABLE', reason: 'COLLECTING' });
    expect(v.ranks).toBeNull();
  });
  it('그룹 평균 대비 +10% 초과 WIN, −10% 미만 LOSE, 사이 DRAW', () => {
    const rows = cohort([100, 100, 100, 100, 100, 100, 100, 100, 100, 100]);
    rows.push({ userId: 'me', enrolledDay: '2026-10-01', daily: days(7, 130), cumulative: 910 });
    const win = competitionView(rows, 'me', today);
    expect(win.wdl.status).toBe('WIN'); // 평균 ≈102.7 → +26.6%
    rows[10] = { ...rows[10], daily: days(7, 105) };
    expect(competitionView(rows, 'me', today).wdl.status).toBe('DRAW');
    rows[10] = { ...rows[10], daily: days(7, 60) };
    const lose = competitionView(rows, 'me', today);
    expect(lose.wdl).toMatchObject({ status: 'LOSE' });
    expect(lose.wdl.gapPct!).toBeLessThan(-10);
  });
  it('신규 참여 3일 미만은 판정 보류, 7일 평균은 관찰일수로 나눔', () => {
    const rows = cohort([60, 60, 60, 60, 60, 60, 60, 60, 60, 60]);
    rows.push({ userId: 'new', enrolledDay: '2026-11-08', daily: days(2, 90), cumulative: 180 });
    const v = competitionView(rows, 'new', today);
    expect(v.wdl.reason).toBe('NEEDS_OBSERVATION');
    expect(v.myAvg7).toBe(90);
    expect(v.ranks!.recent7).toBeNull(); // 7일 전체 관찰 전
  });
  it('동점은 같은 순위, 다음 순위 건너뜀 (1,2,2,4)', () => {
    expect([100, 80, 80, 50].map((m) => competitionRank([100, 80, 80, 50], m))).toEqual([1, 2, 2, 4]);
    expect(classifyWdl(10)).toBe('DRAW'); expect(classifyWdl(10.1)).toBe('WIN'); expect(classifyWdl(-10.1)).toBe('LOSE');
  });
});
