import { PaymentProvider, PgApproval, PgError } from './payment-provider';

/**
 * 토스페이먼츠 결제 승인/취소/조회 (API v1)
 *  - 승인: POST /v1/payments/confirm  { paymentKey, orderId, amount }
 *  - 취소: POST /v1/payments/{paymentKey}/cancel { cancelReason, cancelAmount? }
 *  - 조회: GET  /v1/payments/{paymentKey}
 *  - 인증: Basic base64(secretKey + ':')
 *  - Idempotency-Key 헤더로 중복 요청 방지
 * 실가맹 계약 전에는 test_sk_ 키로만 사용. live_sk_ 키는 운영 승인 후 Secrets Manager 로만 주입.
 */
export class TossPaymentProvider implements PaymentProvider {
  readonly name = 'TOSS' as const;
  private readonly base = 'https://api.tosspayments.com/v1';
  constructor(private readonly secretKey: string, private readonly fetchImpl: typeof fetch = fetch) {}

  private get auth() { return 'Basic ' + Buffer.from(this.secretKey + ':').toString('base64'); }

  private async call(path: string, init: RequestInit & { idempotencyKey?: string }): Promise<PgApproval> {
    let res: Response;
    try {
      res = await this.fetchImpl(this.base + path, {
        ...init,
        headers: { Authorization: this.auth, 'Content-Type': 'application/json', ...(init.idempotencyKey ? { 'Idempotency-Key': init.idempotencyKey } : {}) },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      throw new PgError('NETWORK', 'PG 통신 오류', true, String(e));
    }
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new PgError(json.code ?? 'PG_ERROR', json.message ?? '결제 처리 중 오류가 발생했어요.', res.status >= 500, json);
    return { paymentKey: json.paymentKey, orderId: json.orderId, status: json.status, totalAmount: json.totalAmount, method: json.method, approvedAt: json.approvedAt, raw: json };
  }

  confirm(i: { paymentKey: string; orderId: string; amount: number }) {
    return this.call('/payments/confirm', { method: 'POST', body: JSON.stringify(i), idempotencyKey: `confirm-${i.orderId}` });
  }
  cancel(i: { paymentKey: string; reason: string; amount?: number; idempotencyKey: string }) {
    return this.call(`/payments/${encodeURIComponent(i.paymentKey)}/cancel`, { method: 'POST', body: JSON.stringify({ cancelReason: i.reason, ...(i.amount ? { cancelAmount: i.amount } : {}) }), idempotencyKey: i.idempotencyKey });
  }
  get(paymentKey: string) { return this.call(`/payments/${encodeURIComponent(paymentKey)}`, { method: 'GET' }); }
}
