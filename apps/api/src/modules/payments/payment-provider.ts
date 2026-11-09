export interface PgApproval {
  paymentKey: string;
  orderId: string;
  status: 'DONE' | 'CANCELED' | 'PARTIAL_CANCELED' | 'ABORTED' | 'EXPIRED' | 'WAITING_FOR_DEPOSIT' | 'IN_PROGRESS' | 'READY';
  totalAmount: number;
  method?: string;
  approvedAt?: string;
  raw: unknown;
}
export class PgError extends Error {
  constructor(public readonly code: string, message: string, public readonly retryable = false, public readonly raw?: unknown) { super(message); }
}
export interface PaymentProvider {
  readonly name: 'MOCK' | 'TOSS';
  confirm(input: { paymentKey: string; orderId: string; amount: number }): Promise<PgApproval>;
  cancel(input: { paymentKey: string; reason: string; amount?: number; idempotencyKey: string }): Promise<PgApproval>;
  get(paymentKey: string): Promise<PgApproval>;
}
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
