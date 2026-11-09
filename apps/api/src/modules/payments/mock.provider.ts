import { PaymentProvider, PgApproval, PgError } from './payment-provider';

/**
 * 개발·테스트용 모의 PG. paymentKey 규칙으로 결과를 결정한다.
 *  - mock_fail_*  → 카드 거절
 *  - mock_net_*   → 네트워크 오류 (재시도 가능)
 *  - 그 외        → 승인 (서버가 보낸 amount 그대로 승인 = 실제 PG 처럼 금액 검증은 서버 책임)
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'MOCK' as const;
  private readonly store = new Map<string, PgApproval>();

  async confirm({ paymentKey, orderId, amount }: { paymentKey: string; orderId: string; amount: number }): Promise<PgApproval> {
    if (paymentKey.startsWith('mock_fail')) throw new PgError('REJECT_CARD_PAYMENT', '카드사에서 결제를 거절했어요.');
    if (paymentKey.startsWith('mock_net')) throw new PgError('NETWORK', 'PG 응답 시간 초과', true);
    const existing = this.store.get(paymentKey);
    if (existing) {
      if (existing.orderId !== orderId) throw new PgError('INVALID_REQUEST', '다른 주문의 결제키예요.');
      return existing; // 토스 confirm 멱등 동작 모사
    }
    const approval: PgApproval = { paymentKey, orderId, status: 'DONE', totalAmount: amount, method: '카드', approvedAt: new Date().toISOString(), raw: { mock: true } };
    this.store.set(paymentKey, approval);
    return approval;
  }

  async cancel({ paymentKey, amount }: { paymentKey: string; reason: string; amount?: number; idempotencyKey: string }): Promise<PgApproval> {
    const p = this.store.get(paymentKey);
    if (!p) throw new PgError('NOT_FOUND_PAYMENT', '결제 정보를 찾을 수 없어요.');
    const next: PgApproval = { ...p, status: amount && amount < p.totalAmount ? 'PARTIAL_CANCELED' : 'CANCELED' };
    this.store.set(paymentKey, next);
    return next;
  }

  async get(paymentKey: string): Promise<PgApproval> {
    const p = this.store.get(paymentKey);
    if (!p) throw new PgError('NOT_FOUND_PAYMENT', '결제 정보를 찾을 수 없어요.');
    return p;
  }
}
