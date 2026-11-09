/**
 * AI 학습전략 규칙 (데모 v2.9 _x · Cx · G6 · bu · V6 · hN · nh 이관) — 순수 함수.
 * LLM 은 이 결과를 "설명"만 하고 수치를 만들지 않는다 (decisions D-021).
 */
export const STRATEGY = { baseRecommendedMin: 82, weekRequiredMin: 540, catchUpDays: 4, requiredTotalMin: 120 * 60, clearModeDays: 7 };

export interface Subject { name: string; accuracy: number; progress: number }
export interface Mission { id: string; title: string; minutes: number; done: boolean; priority?: boolean }

/** 데모 _x: 이번 주 부족 학습량을 4일에 나눠 오늘 권장 시간 상향 */
export function weeklyGap(weekMin: number, required = STRATEGY.weekRequiredMin, base = STRATEGY.baseRecommendedMin) {
  const deficit = Math.max(0, required - weekMin);
  if (deficit === 0) return { deficit: 0, days: STRATEGY.catchUpDays, extraPerDay: 0, newRecommended: base, satisfied: true, key: 'none' };
  const extraPerDay = Math.ceil(deficit / STRATEGY.catchUpDays);
  return { deficit, days: STRATEGY.catchUpDays, extraPerDay, newRecommended: base + extraPerDay, satisfied: false, key: `gap:${deficit}` };
}

/** 데모 bu: 가장 약한 과목과 평균 대비 격차 */
export function weakest(subjects: Subject[], accuracy: number | null) {
  if (!subjects.length) return null;
  const w = subjects.reduce((a, b) => (b.accuracy < a.accuracy ? b : a));
  const average = accuracy ?? Math.round(subjects.reduce((s, x) => s + x.accuracy, 0) / subjects.length);
  return { ...w, gap: w.accuracy - average, average };
}

/** 데모 Cx: 권장 시간을 약한 과목 45% · 다음 과목 30% · 오답 복습 나머지로 배분. 이미 완료한 같은 제목 미션은 완료 유지 */
export function planMissions(subjects: Subject[], minutes: number, focus: string | undefined, prev: Mission[] = []): Mission[] {
  const done = new Set(prev.filter((m) => m.done).map((m) => m.title));
  const sorted = [...subjects].sort((a, b) => a.accuracy - b.accuracy);
  const first = focus ?? sorted[0]?.name ?? '핵심 이론';
  const second = sorted.find((s) => s.name !== first)?.name ?? '복습';
  const a = Math.round(minutes * 0.45), b = Math.round(minutes * 0.3), c = minutes - a - b;
  return [
    { id: 'm1', title: `${first} 집중 학습 ${a}분`, minutes: a, done: false, priority: true },
    { id: 'm2', title: `${second} 개념 정리 ${b}분`, minutes: b, done: false },
    { id: 'm3', title: `오답 복습 ${c}분`, minutes: c, done: false },
  ].map((m) => ({ ...m, done: done.has(m.title) }));
}

/** 데모 G6: 같은 부족분(key)으로 이미 적용했으면 변경 없음 */
export function applyPlan(rec: { subjects: Subject[]; accuracy: number | null; missions: Mission[]; appliedPlan: { key: string } | null }, weekMin: number, at: string) {
  const gap = weeklyGap(weekMin);
  if (rec.appliedPlan?.key === gap.key) return { changed: false as const, gap };
  const w = weakest(rec.subjects, rec.accuracy);
  return { changed: true as const, gap, missions: planMissions(rec.subjects, gap.newRecommended, w?.name, rec.missions), appliedPlan: { key: gap.key, recommended: gap.newRecommended, appliedAt: at } };
}

/** 데모 V6: 남은 기간 하루 필요 학습량 */
export function remainingPace(totalMin: number, daysLeft: number) {
  const remainingMin = Math.max(0, STRATEGY.requiredTotalMin - totalMin);
  return { remainingMin, perDayMin: Math.round(daysLeft > 0 ? remainingMin / daysLeft : remainingMin), totalHours: Math.floor(totalMin / 60) };
}

/** 데모 nh · hN: 시험 D-7 이하 CLEAR MODE, 오답복습 40 · 취약과목 30 · 기출 30 */
export const clearModeAvailable = (daysLeft: number) => daysLeft > 0 && daysLeft <= STRATEGY.clearModeDays;
export function clearModeAllocation(totalMin: number) {
  const review = Math.round(totalMin * 0.4), weak = Math.round(totalMin * 0.3);
  return { review, weak, past: totalMin - review - weak, total: totalMin };
}
