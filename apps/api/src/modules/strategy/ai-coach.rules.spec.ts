import { CoachFacts, costMicroUsd, ruleCoachText, validateCoachText } from './ai-coach.rules';

const facts: CoachFacts = { certName: '산업안전기사', daysLeft: 40, weekMin: 300, weekRequiredMin: 540, todayRecommendedMin: 142, streak: 3, progress: 12.5, accuracy: 65, weakestSubject: '전기위험방지', weakestAccuracy: 20, indexValue: 48, clearMode: false };

describe('AI 코칭 출력 검증', () => {
  it('사실에 있는 숫자만 쓰면 통과 (소수 포함)', () => {
    expect(validateCoachText('시험까지 40일, 오늘은 142분! 전기위험방지 정답률 20%를 먼저 끌어올려요. 진도 12.5%예요.', facts)).toEqual({ ok: true });
  });
  it('사실에 없는 숫자(만들어낸 수치)는 거절', () => {
    expect(validateCoachText('지금 페이스면 합격 가능성이 73%예요.', facts)).toMatchObject({ ok: false, reason: 'UNKNOWN_NUMBER:73' });
  });
  it('합격 확률·합격률·보장 표현 거절', () => {
    expect(validateCoachText('도전 지표 48점이면 합격 확률이 높아요.', facts)).toMatchObject({ ok: false, reason: 'FORBIDDEN_PHRASE' });
    expect(validateCoachText('이대로면 반드시 합격해요. 시험까지 40일!', facts)).toMatchObject({ ok: false, reason: 'FORBIDDEN_PHRASE' });
  });
  it('너무 짧거나 긴 응답 거절', () => {
    expect(validateCoachText('화이팅', facts)).toMatchObject({ ok: false, reason: 'LENGTH' });
    expect(validateCoachText('가'.repeat(401), facts)).toMatchObject({ ok: false, reason: 'LENGTH' });
  });
});

describe('규칙 기반 문장', () => {
  it('부족분·약한 과목·CLEAR MODE 반영, 자기 검증 통과', () => {
    const t = ruleCoachText({ ...facts, clearMode: true });
    expect(t).toContain('오늘은 142분');
    expect(t).toContain('전기위험방지 정답률이 20%');
    expect(t).toContain('CLEAR MODE');
    expect(validateCoachText(t, facts)).toEqual({ ok: true });
    expect(ruleCoachText({ ...facts, weekMin: 600 })).toContain('목표 540분을 채웠어요');
  });
});

describe('비용 계산 (micro-USD)', () => {
  it('Opus 5.5: 입력 $4 · 출력 $20 / MTok', () => {
    expect(costMicroUsd('claude-opus-5-5', { input_tokens: 1000, output_tokens: 200 })).toBe(4000 + 4000);
    expect(costMicroUsd('claude-haiku-5-5', { input_tokens: 1000, output_tokens: 200 })).toBe(100 + 100);
    expect(costMicroUsd('unknown-model', { input_tokens: 10, output_tokens: 0 })).toBe(40);
  });
});
