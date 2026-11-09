import { grade, pickItems, unanswered } from './quiz.grading';

const subjects = [{ name: 'A', accuracy: 80, progress: 0 }, { name: 'B', accuracy: 20, progress: 0 }, { name: 'C', accuracy: 0, progress: 0 }];
const items = [
  { id: '1', subject: 'A', answer: 0 }, { id: '2', subject: 'A', answer: 1 },
  { id: '3', subject: 'B', answer: 2 }, { id: '4', subject: 'B', answer: 3 },
];

describe('QUICK TEST 채점 (데모 z6/F6/dN)', () => {
  it('정답률·예상점수(×0.9)·과목별 정확도·과락 위험', () => {
    const r = grade(items, { 1: 0, 2: 1, 3: 2, 4: 0 }, subjects);
    expect(r).toMatchObject({ correct: 3, total: 4, accuracy: 75, expectedScore: 68, passZone: true });
    expect(r.subjects.find((s) => s.name === 'A')!.accuracy).toBe(100);
    expect(r.subjects.find((s) => s.name === 'B')!.accuracy).toBe(50);
    expect(r.subjects.find((s) => s.name === 'C')!.accuracy).toBe(0); // 출제 안 된 과목은 유지
    expect(r.failRisk).toBe(false); // 출제 안 된 과목은 과락 위험 판단에서 제외
  });
  it('과목 40% 미만이면 과락 위험, 예상 60 미만이면 합격권 아님', () => {
    const r = grade(items, { 1: 0, 2: 1, 3: 0, 4: 0 }, subjects);
    expect(r).toMatchObject({ accuracy: 50, expectedScore: 45, passZone: false, failRisk: true, failRiskSubjects: ['B'] });
  });
  it('미응답 번호', () => expect(unanswered(['a', 'b', 'c'], { b: 1 })).toEqual([1, 3]));
});

describe('출제', () => {
  const pool = ['A', 'B', 'C'].flatMap((s) => Array.from({ length: 10 }, (_, i) => ({ id: `${s}${i}`, subject: s })));
  it('과목 균형·낮은 정확도 과목 우선·중복 없음', () => {
    const picked = pickItems(pool, subjects, 20, () => 0.5);
    expect(picked).toHaveLength(20);
    expect(new Set(picked.map((p) => p.id)).size).toBe(20);
    expect(picked[0].subject).toBe('C');
    const count = (s: string) => picked.filter((p) => p.subject === s).length;
    expect([count('A'), count('B'), count('C')].sort()).toEqual([6, 7, 7]);
  });
  it('문항이 부족하면 있는 만큼만', () => expect(pickItems(pool.slice(0, 5), subjects, 20)).toHaveLength(5));
});
