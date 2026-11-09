/**
 * PLIT 도전 지표 (추정) — 데모 v2.9 PLIT_AN.challengeIndex 의 서버 이관 (동일 입력 → 동일 결과)
 * 원칙
 *  - PLIT 내부 학습 기록만 입력으로 사용. 외부 합격률·합격자 통계를 쓰지 않는다.
 *  - 결측 구성요소는 가중치에서 제외 후 재정규화.
 *  - 결과는 5~95로 클램프. 검증된 실제 합격 확률이 아니므로 항상 disclaimer 와 함께 노출.
 */
export const INDEX_VERSION = 'plit-challenge-index-1.0';
export const ENGINE_VERSION = 'plit-internal-2.3.0-server';
export const INDEX_DEFAULTS = {
  winPct: 10, minSample: 10, windowDays: 7, maxSessionMin: 600, maxDailyMin: 960, targetDailyMin: 82, requiredTotalMin: 120 * 60,
  indexWeights: { study: 0.3, trend: 0.1, quiz: 0.25, progress: 0.25, time: 0.1 },
};
export const INDEX_DISCLAIMER = 'PLIT 내부 학습 기록으로 계산한 추정 지표예요. 외부 합격자·합격률 통계를 쓰지 않으며, 검증된 실제 합격 확률이 아니에요.';

export interface IndexInput {
  avg7: number | null; // 최근 7일 일평균 학습 분
  trendPct: number | null; // 직전 7일 대비 증감 %
  quizScore: number | null; // QUICK TEST 정답률
  quizSource?: string;
  progress: number | null;
  daysLeft: number | null;
  remainingMin: number;
  targetDailyMin?: number;
}

type Key = keyof typeof INDEX_DEFAULTS.indexWeights;
const LABEL: Record<Key, string> = { study: '학습시간', trend: '추세', quiz: '간단 테스트', progress: '진도율', time: '남은 기간' };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function challengeIndex(inp: IndexInput, weights = INDEX_DEFAULTS.indexWeights) {
  const target = inp.targetDailyMin || INDEX_DEFAULTS.targetDailyMin;
  const c: Record<Key, number | null> = {
    study: inp.avg7 == null ? null : clamp((inp.avg7 / target) * 100, 0, 100),
    trend: inp.trendPct == null ? null : clamp(50 + inp.trendPct / 2, 0, 100),
    quiz: inp.quizScore == null ? null : clamp(inp.quizScore, 0, 100),
    progress: inp.progress == null ? null : clamp(inp.progress, 0, 100),
    time: null,
  };
  if (inp.daysLeft != null && inp.avg7 != null && inp.daysLeft > 0) {
    const need = Math.max(0, inp.remainingMin || 0) / inp.daysLeft;
    c.time = need <= 0 ? 100 : clamp((inp.avg7 / need) * 100, 0, 100);
  }
  let sw = 0, acc = 0;
  const used: Partial<Record<Key, number>> = {};
  for (const k of Object.keys(weights) as Key[]) if (c[k] != null) { sw += weights[k]; acc += weights[k] * (c[k] as number); used[k] = weights[k]; }
  const value = sw > 0 ? clamp(Math.round(acc / sw), 5, 95) : null;

  const why: string[] = [];
  if (c.study != null) why.push(`최근 7일 일평균 ${Math.round(inp.avg7!)}분 / 권장 ${target}분`);
  if (c.trend != null) why.push(`직전 7일 대비 학습량 ${inp.trendPct! > 0 ? '+' : ''}${inp.trendPct}%`);
  if (c.quiz != null) why.push(`내부 간단 테스트 ${Math.round(inp.quizScore!)}점${inp.quizSource ? ` (${inp.quizSource})` : ''}`);
  if (c.progress != null) why.push(`진도율 ${Math.round(inp.progress!)}%`);
  if (c.time != null) why.push(`남은 ${inp.daysLeft}일 · 필요 페이스 대비 ${Math.round(c.time)}%`);
  for (const k of Object.keys(weights) as Key[]) if (c[k] == null) why.push(`${LABEL[k]} 데이터 없음 → 가중치 제외 후 재정규화`);

  return {
    label: 'PLIT 도전 지표 (추정)', value, version: INDEX_VERSION, engine: ENGINE_VERSION, weights, usedWeights: used,
    components: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v == null ? null : Math.round(v)])) as Record<Key, number | null>,
    explanation: why, disclaimer: INDEX_DISCLAIMER,
  };
}

/** 데모 Jr(): 지표가 계산 불가하면 5 */
export const indexValueOrFloor = (inp: IndexInput) => challengeIndex(inp).value ?? 5;

export interface SessionLike { userId: string; minutes: number; endedAt: Date; }

/**
 * 세션 목록 → 사용자별 7일 일평균·직전 7일 대비 추세.
 * 이상치 규칙: 1회 세션 상한 초과 제외, 하루 합계 상한으로 절삭.
 */
export function studyWindow(sessions: SessionLike[], now: Date, kstDate: (d: Date) => string) {
  const day = 86400000;
  const daily = new Map<string, number>();
  for (const s of sessions) {
    if (s.minutes <= 0 || s.minutes > INDEX_DEFAULTS.maxSessionMin) continue;
    const k = kstDate(s.endedAt);
    daily.set(k, Math.min(INDEX_DEFAULTS.maxDailyMin, (daily.get(k) ?? 0) + s.minutes));
  }
  let week = 0, prev = 0;
  for (let i = 0; i < 14; i++) {
    const v = daily.get(kstDate(new Date(now.getTime() - i * day))) ?? 0;
    if (i < 7) week += v; else prev += v;
  }
  const avg7 = week / 7;
  const prevAvg = prev / 7;
  return { weekMin: week, prevWeekMin: prev, avg7, trendPct: prevAvg > 0 ? Math.round(((avg7 - prevAvg) / prevAvg) * 1000) / 10 : null };
}

export const COMPETITION = { winPct: 10, minSample: 10, minObsDays: 3, windowDays: 7 };

/** 데모 classifyWdl: 그룹 7일 평균 대비 +winPct% 초과 WIN, −winPct% 미만 LOSE, 그 사이 DRAW */
export const classifyWdl = (gapPct: number, winPct = COMPETITION.winPct) => (gapPct > winPct ? 'WIN' : gapPct < -winPct ? 'LOSE' : 'DRAW');
/** 데모 competitionRank: 동점은 같은 순위, 다음 순위는 건너뜀 (1,2,2,4) */
export const competitionRank = (values: number[], mine: number) => values.filter((v) => v > mine).length + 1;

export interface CohortRow { userId: string; enrolledDay: string; daily: Record<string, number>; cumulative: number }
const addDay = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/**
 * 회차 내 경쟁 뷰 (데모 PLIT_AN.computeView 이관). 반환값에는 집계값과 본인 값만 — 타인 원천 기록 없음.
 *  - 7일 평균: 7일 이상 참여자는 7일 합/7, 신규 참여자는 합/관찰일수
 *  - 비교 그룹 = 최근 7일 전체 관찰 참여자. 전체 N·완전 관찰자 모두 최소 표본 이상이어야 판정
 *  - 본인 관찰 3일 미만이면 판정 보류
 */
export function competitionView(rows: CohortRow[], meId: string, today: string, policy = COMPETITION) {
  const W = policy.windowDays, from7 = addDay(today, -(W - 1));
  const calc = rows.map((r) => {
    const start = r.enrolledDay > from7 ? r.enrolledDay : from7;
    const obs7 = dayDiff(start, today) + 1;
    const full = r.enrolledDay <= from7;
    let sum7 = 0;
    for (const [d, m] of Object.entries(r.daily)) if (d >= from7 && d <= today) sum7 += m;
    return { userId: r.userId, todayMin: r.daily[today] ?? 0, sum7, obs7, full, avg7: full ? sum7 / W : sum7 / Math.max(1, obs7), cumulative: r.cumulative };
  });
  const N = calc.length, fullRows = calc.filter((r) => r.full), me = calc.find((r) => r.userId === meId) ?? null;
  const groupAvg7 = fullRows.length ? fullRows.reduce((s, r) => s + r.avg7, 0) / fullRows.length : null;
  const sampleOk = N >= policy.minSample;
  type Wdl = { status: 'WIN' | 'DRAW' | 'LOSE' | 'UNAVAILABLE'; reason: string | null; gapMin: number | null; gapPct: number | null };
  let wdl: Wdl = { status: 'UNAVAILABLE', reason: 'NOT_PARTICIPANT', gapMin: null, gapPct: null };
  if (me) {
    if (!sampleOk || fullRows.length < policy.minSample) wdl = { status: 'UNAVAILABLE', reason: 'COLLECTING', gapMin: null, gapPct: null };
    else if (!(groupAvg7! > 0)) wdl = { status: 'UNAVAILABLE', reason: 'ZERO_AVERAGE', gapMin: null, gapPct: null };
    else if (me.obs7 < policy.minObsDays) wdl = { status: 'UNAVAILABLE', reason: 'NEEDS_OBSERVATION', gapMin: null, gapPct: null };
    else {
      const gp = ((me.avg7 - groupAvg7!) / groupAvg7!) * 100;
      wdl = { status: classifyWdl(gp, policy.winPct) as Wdl['status'], reason: null, gapMin: Math.round(me.avg7 - groupAvg7!), gapPct: Math.round(gp * 10) / 10 };
    }
  }
  const fr = fullRows.map((r) => r.avg7);
  const ranks = me && sampleOk ? {
    today: { rank: competitionRank(calc.map((r) => r.todayMin), me.todayMin), of: N },
    recent7: me.full && fullRows.length >= policy.minSample ? { rank: competitionRank(fr, me.avg7), of: fullRows.length, topPct: Math.max(1, Math.round((competitionRank(fr, me.avg7) / fullRows.length) * 100)) } : null,
    cumulative: { rank: competitionRank(calc.map((r) => r.cumulative), me.cumulative), of: N },
  } : null;
  return {
    sample: N, fullSample: fullRows.length, minSample: policy.minSample, winPct: policy.winPct,
    groupAvg7: groupAvg7 == null ? null : Math.round(groupAvg7), myAvg7: me ? Math.round(me.avg7) : null,
    wdl, ranks,
    note: wdl.reason === 'COLLECTING' ? `비교 대상이 ${policy.minSample}명 이상 모이면 열려요` : wdl.reason === 'NEEDS_OBSERVATION' ? `${policy.minObsDays}일 이상 기록이 쌓이면 비교가 열려요` : null,
  };
}
