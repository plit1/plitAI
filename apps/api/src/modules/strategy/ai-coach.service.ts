import Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Plan } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { kstDate } from '../../common/time';
import { AI_CLIENT, AiClient } from './ai.client';
import { CoachFacts, costMicroUsd, ruleCoachText, validateCoachText } from './ai-coach.rules';

export const COACH_FEATURE = 'COACH';
const SYSTEM = [
  '당신은 자격증 학습 플랫폼 PLIT 의 학습 코치입니다.',
  '사용자 메시지의 JSON 사실만 근거로 한국어 코칭 메시지를 2~3문장, 200자 이내로 씁니다.',
  '숫자는 JSON 에 있는 값만 그대로 쓰고, 새로운 숫자·비율·예측을 만들지 않습니다.',
  '"합격 확률", "합격률", "합격 보장" 같은 표현을 쓰지 않습니다. indexValue 를 언급할 때는 "PLIT 도전 지표(추정)"라고 부릅니다.',
  '친근한 해요체로, 오늘 할 일 하나를 분명히 제안합니다. 인사말·이모지·목록 없이 문장만 씁니다.',
].join('\n');

export interface CoachResult { message: string; source: 'AI' | 'RULES'; reason?: string; remainingToday: number }

@Injectable()
export class AiCoachService {
  private readonly logger = new Logger('AiCoach');
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() @Inject(AI_CLIENT) private readonly client: AiClient | null,
  ) {}

  private model() { return this.config.get<string>('AI_MODEL') || 'claude-opus-5-5'; }
  private limit(plan: Plan) { return Number(this.config.get(plan === 'PREMIUM' ? 'AI_DAILY_LIMIT_PREMIUM' : 'AI_DAILY_LIMIT_FREE') ?? 0); }

  /** 오늘(KST) LLM 호출 수 — 실제 호출만 기록되며, 성공·실패 모두 비용이 들 수 있어 함께 센다 */
  private async usedToday(userId: string) {
    const start = new Date(`${kstDate()}T00:00:00+09:00`);
    return this.prisma.aiUsageLog.count({ where: { userId, feature: COACH_FEATURE, createdAt: { gte: start } } });
  }

  async coach(userId: string, plan: Plan, facts: CoachFacts): Promise<CoachResult> {
    const rules = (reason: string, remaining: number): CoachResult => ({ message: ruleCoachText(facts), source: 'RULES', reason, remainingToday: remaining });
    if (!this.client) return rules('AI_NOT_CONFIGURED', 0);
    const limit = this.limit(plan);
    const used = await this.usedToday(userId);
    if (used >= limit) return rules('DAILY_LIMIT', 0);
    const remaining = limit - used - 1;

    const model = this.model();
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.client.create({
        model,
        max_tokens: 1024,
        output_config: { effort: 'low' }, // 짧은 문장 생성 — 낮은 effort 로 비용·지연 절감 (Opus 5.5 는 thinking 을 끌 수 없음)
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default', // 안전 분류기 거절 시 서버가 다른 모델로 재시도
        system: SYSTEM,
        messages: [{ role: 'user', content: JSON.stringify(facts) }],
      });
    } catch (e) {
      const code = e instanceof Anthropic.RateLimitError ? 'RATE_LIMITED'
        : e instanceof Anthropic.APIConnectionTimeoutError ? 'TIMEOUT'
        : e instanceof Anthropic.APIConnectionError ? 'CONNECTION'
        : e instanceof Anthropic.APIError ? `HTTP_${e.status}` : 'UNKNOWN';
      this.logger.warn(`coach call failed: ${code}`);
      await this.prisma.aiUsageLog.create({ data: { userId, feature: COACH_FEATURE, model, success: false, errorCode: code } });
      return rules(`AI_ERROR:${code}`, remaining);
    }

    const served = response.model || model;
    const usage = response.usage;
    const base = { userId, feature: COACH_FEATURE, model: served, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, costMicroUsd: costMicroUsd(served, usage) };
    if (response.stop_reason === 'refusal') {
      await this.prisma.aiUsageLog.create({ data: { ...base, success: false, errorCode: 'REFUSAL' } });
      return rules('AI_REFUSAL', remaining);
    }
    const text = response.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('').trim();
    const check = validateCoachText(text, facts);
    if (!check.ok) {
      await this.prisma.aiUsageLog.create({ data: { ...base, success: false, errorCode: `INVALID_OUTPUT:${check.reason}`.slice(0, 120) } });
      return rules(`AI_OUTPUT_REJECTED:${check.reason}`, remaining);
    }
    await this.prisma.aiUsageLog.create({ data: { ...base, success: true } });
    return { message: text, source: 'AI', remainingToday: remaining };
  }

  /** 관리자: 기간별 호출·비용 집계 */
  async usageSummary(days = 30) {
    const since = new Date(Date.now() - days * 86400000);
    const rows = await this.prisma.aiUsageLog.groupBy({ by: ['model', 'success'], where: { createdAt: { gte: since } }, _count: true, _sum: { inputTokens: true, outputTokens: true, costMicroUsd: true } });
    const totalMicro = rows.reduce((s, r) => s + (r._sum.costMicroUsd ?? 0), 0);
    return { days, totalUsd: Math.round(totalMicro) / 1_000_000, rows: rows.map((r) => ({ model: r.model, success: r.success, calls: r._count, inputTokens: r._sum.inputTokens ?? 0, outputTokens: r._sum.outputTokens ?? 0, usd: (r._sum.costMicroUsd ?? 0) / 1_000_000 })) };
  }
}
