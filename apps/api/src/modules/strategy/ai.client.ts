import Anthropic from '@anthropic-ai/sdk';

/** 테스트에서 교체 가능한 최소 인터페이스 (SDK 타입 그대로 사용) */
export interface AiClient {
  create(params: Anthropic.Beta.MessageCreateParamsNonStreaming): Promise<Anthropic.Beta.BetaMessage>;
}
export const AI_CLIENT = Symbol('AI_CLIENT');

/** ANTHROPIC_API_KEY 가 없으면 null → 규칙 기반 문장만 사용 */
export function createAiClient(apiKey?: string): AiClient | null {
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey, timeout: 20_000, maxRetries: 2 }); // ms 단위, 429·5xx·연결 오류 자동 재시도
  return { create: (params) => client.beta.messages.create(params) };
}
