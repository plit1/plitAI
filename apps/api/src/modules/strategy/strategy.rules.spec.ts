import { applyPlan, clearModeAllocation, clearModeAvailable, planMissions, remainingPace, weakest, weeklyGap } from './strategy.rules';

const subjects = [{ name: '인간공학', accuracy: 60, progress: 0 }, { name: '전기위험방지', accuracy: 20, progress: 0 }, { name: '기계위험방지', accuracy: 40, progress: 0 }];

describe('학습전략 규칙 (데모 이관)', () => {
  it('주간 부족분 4일 분산 (_x)', () => {
    expect(weeklyGap(540)).toMatchObject({ satisfied: true, newRecommended: 82, key: 'none' });
    expect(weeklyGap(300)).toMatchObject({ deficit: 240, extraPerDay: 60, newRecommended: 142, key: 'gap:240' });
    expect(weeklyGap(539)).toMatchObject({ deficit: 1, extraPerDay: 1, newRecommended: 83 });
  });
  it('가장 약한 과목 (bu)', () => {
    expect(weakest(subjects, null)).toMatchObject({ name: '전기위험방지', average: 40, gap: -20 });
    expect(weakest([], null)).toBeNull();
  });
  it('미션 배분 45/30/나머지, 합계 유지, 완료 유지 (Cx)', () => {
    const m = planMissions(subjects, 142, '전기위험방지', [{ id: 'x', title: '오답 복습 36분', minutes: 36, done: true }]);
    expect(m.map((x) => x.minutes)).toEqual([64, 43, 35]);
    expect(m.reduce((s, x) => s + x.minutes, 0)).toBe(142);
    expect(m[0].title).toBe('전기위험방지 집중 학습 64분');
    expect(m[1].title).toBe('기계위험방지 개념 정리 43분');
    expect(m.find((x) => x.title === '오답 복습 35분')!.done).toBe(false);
    const again = planMissions(subjects, 142, undefined, m.map((x) => ({ ...x, done: true })));
    expect(again.every((x) => x.done)).toBe(true);
  });
  it('같은 부족분으로 재적용 시 변경 없음 (G6)', () => {
    const r = applyPlan({ subjects, accuracy: null, missions: [], appliedPlan: null }, 300, 't');
    expect(r.changed).toBe(true);
    const again = applyPlan({ subjects, accuracy: null, missions: [], appliedPlan: (r as any).appliedPlan }, 300, 't2');
    expect(again.changed).toBe(false);
    expect(applyPlan({ subjects, accuracy: null, missions: [], appliedPlan: (r as any).appliedPlan }, 400, 't3').changed).toBe(true);
  });
  it('남은 페이스 (V6)·CLEAR MODE (nh·hN)', () => {
    expect(remainingPace(1200, 20)).toEqual({ remainingMin: 6000, perDayMin: 300, totalHours: 20 });
    expect(remainingPace(9000, 10).remainingMin).toBe(0);
    expect([0, 1, 7, 8].map(clearModeAvailable)).toEqual([false, true, true, false]);
    expect(clearModeAllocation(100)).toEqual({ review: 40, weak: 30, past: 30, total: 100 });
    expect(clearModeAllocation(83)).toEqual({ review: 33, weak: 25, past: 25, total: 83 });
  });
});
