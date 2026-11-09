/**
 * AI 코칭 보조 규칙 (순수 함수): 사실(facts) 구성, 규칙 기반 문장, LLM 출력 검증, 비용 계산.
 * 원칙: 숫자는 서버가 계산한다. LLM 은 주어진 숫자를 설명만 하고 새 숫자를 만들지 않는다.
 */
export interface CoachFacts {
  certName: string;
  daysLeft: number;
  weekMin: number;
  weekRequiredMin: number;
  todayRecommendedMin: number;
  streak: number;
  progress: number; // %
  accuracy: number | null; // 최근 QUICK TEST 정답률
  weakestSubject: string | null;
  weakestAccuracy: number | null;
  indexValue: number | null; // PLIT 도전 지표 (추정)
  clearMode: boolean;
}

/** 금지 표현: 검증되지 않은 확률·보장 표현 */
const FORBIDDEN = [/합격\s*확률/, /합격률/, /합격\s*보장/, /반드시\s*합격/, /100\s*%\s*합격/];

/** 출력에 등장한 모든 숫자가 사실 목록에 있는지 + 금지 표현이 없는지 */
export function validateCoachText(text: string, facts: CoachFacts): { ok: true } | { ok: false; reason: string } {
  const t = text.trim();
  if (t.length < 10 || t.length > 400) return { ok: false, reason: 'LENGTH' };
  if (FORBIDDEN.some((r) => r.test(t))) return { ok: false, reason: 'FORBIDDEN_PHRASE' };
  const allowed = new Set(Object.values(facts).filter((v): v is number => typeof v === 'number').map((n) => String(Math.round(n * 10) / 10)));
  const nums = t.replace(/,(?=\d{3})/g, '').match(/\d+(\.\d+)?/g) ?? [];
  const unknown = nums.filter((n) => !allowed.has(String(Number(n))));
  return unknown.length ? { ok: false, reason: `UNKNOWN_NUMBER:${unknown.join(',')}` } : { ok: true };
}

/** 키 없음·한도 초과·오류·검증 실패 시 사용하는 규칙 기반 문장 */
export function ruleCoachText(f: CoachFacts): string {
  const parts: string[] = [];
  if (f.daysLeft > 0) parts.push(`${f.certName} 시험까지 ${f.daysLeft}일 남았어요.`);
  if (f.weekMin < f.weekRequiredMin) parts.push(`이번 주 ${f.weekMin}분 공부했으니 오늘은 ${f.todayRecommendedMin}분을 목표로 해봐요.`);
  else parts.push(`이번 주 목표 ${f.weekRequiredMin}분을 채웠어요. 지금 페이스를 유지해요.`);
  if (f.weakestSubject && f.weakestAccuracy != null) parts.push(`${f.weakestSubject} 정답률이 ${f.weakestAccuracy}%라 먼저 보강하면 좋아요.`);
  if (f.clearMode) parts.push('CLEAR MODE 기간이니 오답 복습 비중을 높여요.');
  return parts.join(' ');
}

/** USD per 1M tokens (skill 캐시 2026-10-06 기준). 1 $/MTok = 1 micro-USD/token */
export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
};

export function costMicroUsd(model: string, u: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null }) {
  const p = MODEL_PRICES[model] ?? MODEL_PRICES['claude-opus-5-5']; // 미등록 모델은 보수적으로 Opus 가격
  const input = u.input_tokens * p.input + (u.cache_creation_input_tokens ?? 0) * p.input * 1.25 + (u.cache_read_input_tokens ?? 0) * p.input * 0.1;
  return Math.ceil(input + u.output_tokens * p.output);
}
