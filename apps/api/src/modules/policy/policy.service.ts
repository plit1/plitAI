import { Injectable } from '@nestjs/common';
import { Plan, Prisma } from '@prisma/client';
import { PrismaService, Tx } from '../../common/prisma.service';
import { DEFAULT_POLICY, DEFAULT_POLICY_VERSION, Feature, PolicyValues } from './policy.defaults';

export interface CurrentPolicy { version: string; values: PolicyValues; }

@Injectable()
export class PolicyService {
  private cache: { at: number; policy: CurrentPolicy } | null = null;
  constructor(private readonly prisma: PrismaService) {}

  async current(tx?: Tx): Promise<CurrentPolicy> {
    if (!tx && this.cache && Date.now() - this.cache.at < 10_000) return this.cache.policy;
    const row = await (tx ?? this.prisma).policyVersion.findFirst({ where: { isCurrent: true }, orderBy: { createdAt: 'desc' } });
    const policy: CurrentPolicy = row
      ? { version: row.id, values: { ...DEFAULT_POLICY, ...(row.values as Partial<PolicyValues>) } }
      : { version: DEFAULT_POLICY_VERSION, values: DEFAULT_POLICY };
    if (!tx) this.cache = { at: Date.now(), policy };
    return policy;
  }

  rewardFor(values: PolicyValues, plan: Plan): number {
    return plan === 'PREMIUM' ? values.boosterReward : values.togetherReward;
  }

  canUse(values: PolicyValues, plan: Plan, feature: Feature): boolean {
    return plan === 'PREMIUM' || values.freeFeatures.includes(feature);
  }

  /** 새 정책 버전 발행. 기존 참여자는 rewardSnapshot 으로 보호되므로 소급되지 않는다. */
  async publish(tx: Tx, id: string, patch: Partial<PolicyValues>, actorId: string) {
    const base = await this.current(tx);
    const values = { ...base.values, ...patch };
    await tx.policyVersion.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
    const row = await tx.policyVersion.create({ data: { id, values: values as unknown as Prisma.InputJsonValue, isCurrent: true, createdBy: actorId } });
    this.cache = null;
    return { before: base, after: { version: row.id, values } };
  }
}
