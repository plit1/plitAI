/** 채점 순수 함수 (데모 z6 · F6 · dN 이관) */
export const TEST_SIZE = 20;
export interface GradeItem { id: string; subject: string; answer: number }
export interface Subject { name: string; accuracy: number; progress: number }

export function grade(items: GradeItem[], answers: Record<string, number>, subjects: Subject[]) {
  const correct = items.filter((i) => answers[i.id] === i.answer).length;
  const accuracy = Math.round((correct / items.length) * 100);
  const expectedScore = Math.round(accuracy * 0.9); // 데모 F6: 예상 점수 = 정답률 × 0.9 (보수적 추정)
  const nextSubjects = subjects.map((s) => {
    const mine = items.filter((i) => i.subject === s.name);
    if (!mine.length) return s;
    return { ...s, accuracy: Math.round((mine.filter((i) => answers[i.id] === i.answer).length / mine.length) * 100) };
  });
  const failRiskSubjects = nextSubjects.filter((s) => items.some((i) => i.subject === s.name) && s.accuracy < 40).map((s) => s.name);
  return { correct, total: items.length, accuracy, expectedScore, subjects: nextSubjects, passZone: expectedScore >= 60, failRisk: failRiskSubjects.length > 0, failRiskSubjects };
}

/** 미응답 문항 번호 (1부터) — 데모 fN */
export const unanswered = (itemIds: string[], answers: Record<string, unknown>) => itemIds.map((id, i) => (answers[id] === undefined ? i + 1 : 0)).filter(Boolean);

/**
 * 출제: 과목별 균형, 정확도 낮은 과목부터 순환 선택 (데모 응시 화면 정렬 규칙).
 * rand 는 테스트에서 고정하기 위해 주입.
 */
export function pickItems<T extends { id: string; subject: string }>(pool: T[], subjects: Subject[], size = TEST_SIZE, rand: () => number = Math.random): T[] {
  const shuffle = <U>(a: U[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const acc = (name: string) => subjects.find((s) => s.name === name)?.accuracy ?? 0;
  const groups = [...new Set(pool.map((p) => p.subject))].sort((a, b) => acc(a) - acc(b)).map((name) => shuffle(pool.filter((p) => p.subject === name)));
  const out: T[] = [];
  for (let round = 0; out.length < Math.min(size, pool.length); round++) for (const g of groups) if (g[round] && out.length < size) out.push(g[round]);
  return out;
}
