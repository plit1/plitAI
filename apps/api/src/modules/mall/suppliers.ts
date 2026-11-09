import { randomBytes } from 'crypto';

export interface IssueResult { ref: string; code: string; expiresAt: Date; isTest: boolean }
export interface CouponSupplier {
  readonly id: string;
  readonly configured: boolean;
  /** 실제 가치가 있는 쿠폰인지 (true 면 REWARDS_LIVE 승인 전 발급 금지) */
  readonly realValue: boolean;
  issue(input: { orderId: string; sku: string | null; price: number }): Promise<IssueResult>;
  cancel(ref: string): Promise<void>;
}

const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const block = () => Array.from(randomBytes(4), (b) => A[b % A.length]).join('');

/** 테스트 공급사: 실제로 사용할 수 없는 TEST- 쿠폰. sku 'TEST_FAIL' 은 발급 실패를 재현 */
export class TestCouponSupplier implements CouponSupplier {
  readonly id = 'TEST'; readonly configured = true; readonly realValue = false;
  async issue(input: { orderId: string; sku: string | null }) {
    if (input.sku === 'TEST_FAIL') throw new Error('테스트 공급사: 발급 실패 재현');
    return { ref: `test-${input.orderId}`, code: `TEST-${block()}-${block()}-${block()}`, expiresAt: new Date(Date.now() + 90 * 86400000), isTest: true };
  }
  async cancel() { /* 테스트 쿠폰은 즉시 취소 */ }
}

/** 실공급사 자리 (기프티쇼 비즈 등) — 계약·API 키·명세 확인 전에는 호출하지 않음 */
export class UnconfiguredSupplier implements CouponSupplier {
  readonly configured = false; readonly realValue = true;
  constructor(readonly id: string) {}
  async issue(): Promise<IssueResult> { throw new Error(`${this.id} 공급사 미연동`); }
  async cancel() { throw new Error(`${this.id} 공급사 미연동`); }
}

export const SUPPLIERS: Record<string, CouponSupplier> = { TEST: new TestCouponSupplier(), GIFTISHOW: new UnconfiguredSupplier('GIFTISHOW') };
export const supplierFor = (id: string) => SUPPLIERS[id] ?? new UnconfiguredSupplier(id);
