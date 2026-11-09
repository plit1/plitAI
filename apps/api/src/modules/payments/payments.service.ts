import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { Order, Prisma } from '@prisma/client';
import { AppError, Conflict, Forbidden, NotFound } from '../../common/errors';
import { PrismaService, Tx } from '../../common/prisma.service';
import { addDays, daysBetween } from '../../common/time';
import { AuditService } from '../admin/audit.service';
import { ChallengesService } from '../challenges/challenges.service';
import { EntitlementService } from '../challenges/entitlement.service';
import { PolicyService } from '../policy/policy.service';
import { PAYMENT_PROVIDER, PaymentProvider, PgApproval, PgError } from './payment-provider';

export const PRODUCT_CODE = 'AI_BOOSTER_PASS';
/** 패스 이용 종료: 시험일 + 30일 (합격 인증 기간 포함). decisions.md D-007 */
export const PASS_GRACE_DAYS = 30;
const json = (v: unknown) => JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments');
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly challenges: ChallengesService,
    private readonly entitlements: EntitlementService,
    private readonly audit: AuditService,
    @Inject(PAYMENT_PROVIDER) private readonly pg: PaymentProvider,
  ) {}

  private newOrderNo() { return 'PLIT-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(); }

  /** 1) 주문 생성 — 금액은 항상 서버 정책값 */
  async createOrder(userId: string, offeringId: string) {
    const o = await this.prisma.challengeOffering.findUnique({ where: { id: offeringId }, include: { cert: true } });
    if (!o || o.hidden) throw NotFound('시험 회차');
    if (o.status === 'cancelled') throw new AppError('SESSION_CANCELLED', '취소된 시험 회차예요. 이용권을 구매할 수 없어요.');
    if (daysBetween(new Date(), addDays(o.examDate, PASS_GRACE_DAYS)) < 0) throw new AppError('SESSION_ENDED', '이용 종료일이 지난 회차예요.');
    if (await this.entitlements.findActivePass(this.prisma, userId, offeringId)) throw Conflict('DUPLICATE_PASS', '이미 이 회차의 유효한 플릿 부스터 패스가 있어요. 같은 회차는 중복 구매되지 않아요.');

    const { version, values } = await this.policy.current();
    const pending = await this.prisma.order.findFirst({ where: { userId, offeringId, status: 'PENDING', paymentKey: null } });
    if (pending && pending.amount === values.passPrice) return this.checkoutView(pending, true);
    if (pending) {
      await this.prisma.order.update({ where: { id: pending.id }, data: { status: 'CANCELLED', failReason: `정책 변경으로 미승인 결제 요청 만료 (${pending.amount} → ${values.passPrice})` } });
    }
    const order = await this.prisma.order.create({
      data: {
        orderNo: this.newOrderNo(), userId, productCode: PRODUCT_CODE, productName: `플릿 부스터 패스 · ${o.cert.name} ${o.round}`,
        offeringId, certId: o.certId, amount: values.passPrice, policyVersion: version, pgProvider: this.pg.name, isTest: this.pg.name === 'MOCK' || process.env.NODE_ENV !== 'production',
      },
    });
    return this.checkoutView(order, false);
  }

  private checkoutView(o: Order, reused: boolean) {
    return { orderNo: o.orderNo, orderName: o.productName, amount: o.amount, vatIncluded: o.vatIncluded, provider: o.pgProvider, clientKey: process.env.TOSS_CLIENT_KEY || null, customerKey: o.userId, reused };
  }

  /**
   * 2) 결제 승인 — 토스 successUrl 로 돌아온 paymentKey/orderId/amount 를 서버가 검증 후 승인.
   *  - 금액 위변조: 주문 금액과 다르면 PG 호출 전에 거절
   *  - 동시/중복 승인: 조건부 UPDATE 로 결제키 선점, 이미 PAID 면 같은 결과 반환(멱등)
   *  - PG 호출은 DB 트랜잭션 밖에서 (잠금 장시간 보유 금지)
   */
  async confirm(userId: string, input: { orderNo: string; paymentKey: string; amount: number }) {
    const order = await this.prisma.order.findUnique({ where: { orderNo: input.orderNo } });
    if (!order || order.userId !== userId) throw NotFound('주문');
    if (order.status === 'PAID') {
      if (order.paymentKey === input.paymentKey) return this.resultView(order.id, true);
      throw Conflict('ALREADY_PAID', '이미 결제가 완료된 주문이에요.');
    }
    if (order.status !== 'PENDING') throw Conflict('ORDER_NOT_PAYABLE', '결제할 수 없는 주문 상태예요.');
    if (!Number.isInteger(input.amount) || input.amount !== order.amount) {
      await this.recordEvent(this.prisma, order.id, `amount-mismatch:${order.id}:${input.paymentKey}`, 'AMOUNT_MISMATCH', input);
      throw new AppError('AMOUNT_MISMATCH', '결제 금액이 주문 금액과 달라요.', HttpStatus.BAD_REQUEST);
    }
    const claimed = await this.prisma.order.updateMany({
      where: { id: order.id, status: 'PENDING', OR: [{ paymentKey: null }, { paymentKey: input.paymentKey }] },
      data: { paymentKey: input.paymentKey },
    });
    if (claimed.count === 0) throw Conflict('CONFIRM_IN_PROGRESS', '이미 다른 결제 승인이 진행 중이에요.');

    let approval: PgApproval;
    try {
      approval = await this.pg.confirm({ paymentKey: input.paymentKey, orderId: order.orderNo, amount: order.amount });
    } catch (e) {
      const err = e instanceof PgError ? e : new PgError('UNKNOWN', String(e), true);
      await this.recordEvent(this.prisma, order.id, `confirm-fail:${order.id}:${input.paymentKey}:${Date.now()}`, 'FAILED', { code: err.code, message: err.message, raw: err.raw });
      if (err.retryable) {
        // 결과 불명 → PENDING 유지(결제키 보존). 같은 paymentKey 로 재시도하거나 웹훅/대사 작업이 확정한다.
        throw new AppError('PG_UNAVAILABLE', '결제 확인이 지연되고 있어요. 잠시 후 다시 시도해주세요.', HttpStatus.SERVICE_UNAVAILABLE);
      }
      await this.prisma.order.update({ where: { id: order.id }, data: { status: 'FAILED', failReason: `${err.code}: ${err.message}` } });
      throw new AppError('PAYMENT_FAILED', err.message, HttpStatus.PAYMENT_REQUIRED, { pgCode: err.code });
    }
    await this.applyApproval(order.id, approval);
    return this.resultView(order.id, false);
  }

  /** 승인 결과 반영 (confirm·웹훅·대사 작업 공용, 멱등) */
  async applyApproval(orderId: string, approval: PgApproval) {
    await this.prisma.$transaction(async (tx) => {
      const [order] = await tx.$queryRaw<Order[]>`SELECT * FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
      if (!order || order.status === 'PAID') return;
      if (approval.status !== 'DONE') {
        await tx.order.update({ where: { id: orderId }, data: { status: 'FAILED', failReason: `PG status ${approval.status}` } });
        return;
      }
      if (approval.totalAmount !== order.amount || approval.orderId !== order.orderNo) {
        // PG 승인 금액이 주문과 다름 → 반영하지 않고 즉시 취소 대상으로 기록
        await this.recordEvent(tx, orderId, `approval-mismatch:${approval.paymentKey}`, 'APPROVAL_MISMATCH', approval.raw);
        await tx.order.update({ where: { id: orderId }, data: { status: 'FAILED', failReason: 'PG 승인 금액/주문번호 불일치 — 관리자 확인 필요' } });
        return;
      }
      await this.recordEvent(tx, orderId, `confirmed:${approval.paymentKey}`, 'CONFIRMED', approval.raw);
      await tx.order.update({ where: { id: orderId }, data: { status: 'PAID', paymentKey: approval.paymentKey, method: approval.method, approvedAt: approval.approvedAt ? new Date(approval.approvedAt) : new Date() } });

      const offering = await tx.challengeOffering.findUniqueOrThrow({ where: { id: order.offeringId } });
      const dup = await this.entitlements.findActivePass(tx, order.userId, order.offeringId);
      if (dup) {
        // 동일 회차 유효 이용권 존재 → 패스 발급하지 않고 자동 환불 대상 (데모 규칙)
        await this.recordEvent(tx, orderId, `dup-pass:${orderId}`, 'DUPLICATE_PASS', { existingPassId: dup.id });
        return;
      }
      const pass = await tx.boosterPass.create({
        data: { userId: order.userId, certId: order.certId, offeringId: order.offeringId, orderId: order.id, source: 'PAYMENT', expiresAt: addDays(offering.examDate, PASS_GRACE_DAYS) },
      });
      await this.challenges.upgradeToPremium(tx, order.userId, order.offeringId, pass.id).catch(async (e) => {
        // 부스터 정원 마감 시 패스는 유지하되 전환은 보류 → 사용자에게 안내, 관리자 처리
        if (e instanceof AppError && e.code === 'CAPACITY_FULL') { await this.recordEvent(tx, orderId, `upgrade-full:${orderId}`, 'UPGRADE_CAPACITY_FULL', {}); return; }
        throw e;
      });
    });
    const after = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { events: true, pass: true } });
    if (after.status === 'PAID' && !after.pass && after.events.some((e) => e.type === 'DUPLICATE_PASS')) {
      await this.refund(after.id, { reason: '동일 회차 유효 이용권 존재 → 중복 결제 자동 환불', actor: 'system' });
    }
  }

  private recordEvent(db: Tx | PrismaService, orderId: string, eventKey: string, type: string, payload: unknown) {
    return db.paymentEvent.upsert({ where: { eventKey }, create: { orderId, eventKey, type, payload: json(payload) }, update: {} });
  }

  private async resultView(orderId: string, idempotent: boolean) {
    const o = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { pass: true } });
    return { orderNo: o.orderNo, status: o.status, amount: o.amount, approvedAt: o.approvedAt, pass: o.pass ? { id: o.pass.id, status: o.pass.status, expiresAt: o.pass.expiresAt } : null, idempotent };
  }

  /** 사용자 환불 요청: 결제 후 refundDays 이내 */
  async requestRefund(userId: string, orderNo: string) {
    const order = await this.prisma.order.findUnique({ where: { orderNo } });
    if (!order || order.userId !== userId) throw NotFound('주문');
    const { values } = await this.policy.current();
    if (order.status !== 'PAID') throw Conflict('NOT_REFUNDABLE', '환불할 수 있는 결제가 아니에요.');
    if (!order.approvedAt || daysBetween(order.approvedAt, new Date()) > values.refundDays) {
      throw Forbidden('REFUND_PERIOD_OVER', `결제 후 ${values.refundDays}일이 지나 직접 환불할 수 없어요. 고객센터로 문의해주세요.`);
    }
    return this.refund(order.id, { reason: '사용자 환불 요청', actor: userId });
  }

  /** 환불 실행 (사용자·관리자·시스템 공용). PG 취소 → 주문 REFUNDED → 패스 회수 → 플릿런 전환 */
  async refund(orderId: string, opts: { reason: string; actor: string; adminId?: string; ip?: string }) {
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    if (order.status === 'REFUNDED') return this.resultView(orderId, true);
    if (order.status !== 'PAID' || !order.paymentKey) throw Conflict('NOT_REFUNDABLE', '환불할 수 있는 결제가 아니에요.');
    try {
      await this.pg.cancel({ paymentKey: order.paymentKey, reason: opts.reason, idempotencyKey: `refund-${order.id}` });
    } catch (e) {
      const err = e instanceof PgError ? e : new PgError('UNKNOWN', String(e), true);
      await this.recordEvent(this.prisma, order.id, `cancel-fail:${order.id}:${Date.now()}`, 'CANCEL_FAILED', { code: err.code, message: err.message });
      throw new AppError('REFUND_FAILED', '환불 처리 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.', HttpStatus.BAD_GATEWAY);
    }
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({ where: { id: order.id, status: 'PAID' }, data: { status: 'REFUNDED', refundedAmount: order.amount } });
      if (count === 0) return;
      await this.recordEvent(tx, order.id, `refunded:${order.id}`, 'CANCEL', { reason: opts.reason, actor: opts.actor });
      const pass = await tx.boosterPass.findUnique({ where: { orderId: order.id } });
      if (pass && pass.status === 'ACTIVE') {
        await tx.boosterPass.update({ where: { id: pass.id }, data: { status: 'REVOKED', revokedAt: new Date() } });
        await this.challenges.downgradeToFree(tx, pass.id, `환불 · ${opts.reason}`);
      }
      if (opts.adminId) await this.audit.log(tx, { actorId: opts.adminId, action: 'ORDER_REFUND', targetType: 'Order', targetId: order.id, before: { status: 'PAID' }, after: { status: 'REFUNDED', reason: opts.reason }, ip: opts.ip });
    });
    return this.resultView(order.id, false);
  }

  /** 웹훅: 서명 대신 PG 조회 API 로 상태를 재확인 후 반영 (위조 웹훅 무력화) */
  async handleWebhook(body: { eventType?: string; data?: { paymentKey?: string; orderId?: string; status?: string } }, eventId: string) {
    const paymentKey = body.data?.paymentKey;
    const orderNo = body.data?.orderId;
    if (!paymentKey || !orderNo) return { ignored: true };
    const order = await this.prisma.order.findUnique({ where: { orderNo } });
    if (!order) return { ignored: true };
    const created = await this.prisma.paymentEvent.findUnique({ where: { eventKey: `webhook:${eventId}` } });
    if (created) return { duplicate: true };
    await this.recordEvent(this.prisma, order.id, `webhook:${eventId}`, 'WEBHOOK', body);
    const actual = await this.pg.get(paymentKey).catch(() => null);
    if (!actual || actual.orderId !== order.orderNo) return { ignored: true };
    if (actual.status === 'DONE' && order.status === 'PENDING') {
      await this.prisma.order.updateMany({ where: { id: order.id, paymentKey: null }, data: { paymentKey } });
      await this.applyApproval(order.id, actual);
    }
    return { ok: true };
  }

  async myOrders(userId: string) {
    return this.prisma.order.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { orderNo: true, productName: true, amount: true, status: true, approvedAt: true, refundedAmount: true, createdAt: true, pass: { select: { id: true, status: true, expiresAt: true } } } });
  }

  async myPasses(userId: string) {
    return this.prisma.boosterPass.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, include: { offering: { include: { cert: { select: { name: true } } } } } });
  }
}
