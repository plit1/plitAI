import { HttpStatus, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MallOrder, MallProduct } from '@prisma/client';
import { AppError, Conflict, Forbidden, NotFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { openSecret, sealSecret } from '../../common/totp';
import { AuditService } from '../admin/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PointsService } from '../points/points.service';
import { PolicyService } from '../policy/policy.service';
import { supplierFor, SUPPLIERS } from './suppliers';

export const MALL_CATEGORIES = [{ id: 'cvs', label: '편의점' }, { id: 'cafe', label: '카페' }, { id: 'life', label: '뷰티·생활' }, { id: 'book', label: '도서' }];
const kstDayStart = (d = new Date()) => new Date(`${new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10)}T00:00:00+09:00`);

@Injectable()
export class MallService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Mall');
  private timer?: NodeJS.Timeout;
  constructor(
    private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly points: PointsService, private readonly policy: PolicyService,
    private readonly audit: AuditService, private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => this.recoverStuck().catch((e) => this.logger.error(e)), 15 * 60_000);
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  /**
   * 발급 대기(PENDING)로 10분 넘게 남은 주문 정리 (차감 후 서버 중단 등).
   * 테스트 공급사는 발급 기록이 없으므로 실패 처리 + 포인트 복구. 실공급사 연동 시에는 공급사 조회로 발급 여부를 먼저 확인해야 함.
   */
  async recoverStuck(now = new Date()) {
    const stuck = await this.prisma.mallOrder.findMany({ where: { status: 'PENDING', createdAt: { lt: new Date(now.getTime() - 10 * 60_000) } }, include: { product: true } });
    let recovered = 0;
    for (const o of stuck) {
      if (supplierFor(o.supplier).realValue) { this.logger.warn(`실공급사 주문 ${o.id} 은 공급사 조회 후 수동 확인 필요`); continue; }
      await this.prisma.$transaction(async (tx) => {
        const r = await tx.mallOrder.updateMany({ where: { id: o.id, status: 'PENDING' }, data: { status: 'FAILED', failReason: '발급이 확인되지 않아 취소했어요. 포인트는 복구됐어요.' } });
        if (!r.count) return;
        if (o.ledgerEntryId) await this.points.reverse(tx, o.ledgerEntryId, '포인트몰 발급 미확인 · 포인트 복구');
        if (o.product.stock !== null) await tx.mallProduct.update({ where: { id: o.productId }, data: { stock: { increment: 1 } } });
        recovered++;
      });
    }
    return { checked: stuck.length, recovered };
  }

  private get rewardsLive() { return this.config.get('REWARDS_LIVE') === true; }

  private productView(p: MallProduct) {
    const s = supplierFor(p.supplier);
    return { id: p.id, category: p.category, brand: p.brand, name: p.name, price: p.price, soldOut: p.stock !== null && p.stock <= 0, isDemo: p.isDemo, testCoupon: !s.realValue };
  }

  async products(category?: string) {
    const rows = await this.prisma.mallProduct.findMany({ where: { status: 'ACTIVE', ...(category ? { category } : {}) }, orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }] });
    return {
      categories: MALL_CATEGORIES, items: rows.map((p) => this.productView(p)),
      notice: this.rewardsLive ? '교환한 쿠폰은 공급사 정책에 따라 사용할 수 있어요.' : '지금은 시범 운영 중이에요. 교환하면 테스트 쿠폰이 발급되며 실제 매장에서 사용할 수 없어요.',
    };
  }

  private orderView(o: MallOrder & { product?: MallProduct }, reveal = false) {
    return {
      id: o.id, status: o.status, price: o.price, createdAt: o.createdAt, product: o.product ? { id: o.product.id, brand: o.product.brand, name: o.product.name } : undefined,
      couponLast4: o.couponLast4, couponExpires: o.couponExpires, isTestCoupon: o.isTestCoupon, failReason: o.failReason, cancelledAt: o.cancelledAt, cancelReason: o.cancelReason,
      ...(reveal && o.status === 'ISSUED' && o.couponCodeEnc ? { couponCode: openSecret(o.couponCodeEnc) } : {}),
    };
  }

  /**
   * 교환: (1) 트랜잭션 — 한도·재고 확인, 주문 PENDING, 포인트 차감(dedupe exchange:{orderId})
   *       (2) 트랜잭션 밖 — 공급사 발급
   *       (3) 결과 반영 — 성공 ISSUED / 실패 FAILED + 포인트 역분개 + 재고 복구
   * 같은 idempotencyKey 재요청은 기존 주문을 그대로 반환.
   */
  async exchange(userId: string, productId: string, idempotencyKey: string) {
    const existing = await this.prisma.mallOrder.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } }, include: { product: true } });
    if (existing) return this.orderView(existing, true);
    const product = await this.prisma.mallProduct.findUnique({ where: { id: productId } });
    if (!product || product.status !== 'ACTIVE') throw NotFound('상품');
    const supplier = supplierFor(product.supplier);
    if (!supplier.configured) throw new AppError('SUPPLIER_NOT_CONFIGURED', '지금은 교환할 수 없는 상품이에요. (공급사 연동 준비 중)', HttpStatus.SERVICE_UNAVAILABLE);
    if (supplier.realValue && !this.rewardsLive) throw Forbidden('REWARDS_NOT_LIVE', '실제 상품 교환은 운영 승인 후 열려요.');

    let order: MallOrder;
    try {
      order = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'mall:' + userId}))`; // 회원 단위 직렬화 (한도 경합 방지)
        const { values } = await this.policy.current(tx);
        const since = kstDayStart();
        const [today, todaySame] = await Promise.all([
          tx.mallOrder.count({ where: { userId, createdAt: { gte: since }, status: { in: ['PENDING', 'ISSUED'] } } }),
          tx.mallOrder.count({ where: { userId, productId, createdAt: { gte: since }, status: { in: ['PENDING', 'ISSUED'] } } }),
        ]);
        if (today >= values.mallDailyOrders) throw new AppError('DAILY_LIMIT', `하루 ${values.mallDailyOrders}번까지 교환할 수 있어요.`, HttpStatus.TOO_MANY_REQUESTS);
        if (todaySame >= product.perUserDaily) throw new AppError('PRODUCT_DAILY_LIMIT', `이 상품은 하루 ${product.perUserDaily}개까지 교환할 수 있어요.`, HttpStatus.TOO_MANY_REQUESTS);
        if (product.stock !== null) {
          const r = await tx.mallProduct.updateMany({ where: { id: productId, stock: { gt: 0 } }, data: { stock: { decrement: 1 } } });
          if (!r.count) throw Conflict('SOLD_OUT', '품절된 상품이에요.');
        }
        const o = await tx.mallOrder.create({ data: { userId, productId, price: product.price, idempotencyKey, supplier: supplier.id, isTestCoupon: !supplier.realValue } });
        const { entry } = await this.points.post(tx, { userId, type: 'SPEND', amount: -product.price, reason: `포인트몰 교환 · ${product.brand} ${product.name}`, dedupeKey: `exchange:${o.id}`, refType: 'MallOrder', refId: o.id });
        return tx.mallOrder.update({ where: { id: o.id }, data: { ledgerEntryId: entry.id } });
      });
    } catch (e) {
      // 같은 키 동시 요청: 유니크 충돌 → 먼저 생성된 주문 반환
      const dup = await this.prisma.mallOrder.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } }, include: { product: true } });
      if (dup) return this.orderView(dup, true);
      throw e;
    }

    try {
      const issued = await supplier.issue({ orderId: order.id, sku: product.supplierSku, price: product.price });
      const done = await this.prisma.$transaction(async (tx) => {
        const o = await tx.mallOrder.update({ where: { id: order.id }, data: { status: 'ISSUED', supplierRef: issued.ref, couponCodeEnc: sealSecret(issued.code), couponLast4: issued.code.slice(-4), couponExpires: issued.expiresAt, isTestCoupon: issued.isTest }, include: { product: true } });
        await this.notifications.notify(tx, { userId, type: 'MALL_ORDER', title: '쿠폰이 발급됐어요', body: `${product.brand} ${product.name}${issued.isTest ? ' (테스트 쿠폰 · 실제 사용 불가)' : ''}`, link: '/mall/coupons', dedupeKey: `mall-issued:${o.id}` });
        return o;
      });
      return this.orderView(done, true);
    } catch (e) {
      this.logger.warn(`발급 실패 ${order.id}: ${(e as Error).message}`);
      const failed = await this.prisma.$transaction(async (tx) => {
        await this.points.reverse(tx, order.ledgerEntryId!, '포인트몰 발급 실패 · 포인트 복구');
        if (product.stock !== null) await tx.mallProduct.update({ where: { id: productId }, data: { stock: { increment: 1 } } });
        return tx.mallOrder.update({ where: { id: order.id }, data: { status: 'FAILED', failReason: '쿠폰 발급에 실패했어요. 포인트는 복구됐어요.' }, include: { product: true } });
      });
      throw new AppError('ISSUE_FAILED', failed.failReason!, HttpStatus.BAD_GATEWAY, { orderId: failed.id });
    }
  }

  async myOrders(userId: string) {
    const rows = await this.prisma.mallOrder.findMany({ where: { userId }, include: { product: true }, orderBy: { createdAt: 'desc' }, take: 100 });
    return rows.map((o) => this.orderView(o));
  }
  async myOrder(userId: string, id: string) {
    const o = await this.prisma.mallOrder.findFirst({ where: { id, userId }, include: { product: true } });
    if (!o) throw NotFound('교환 내역');
    return this.orderView(o, true);
  }

  // ── 관리자 ──
  adminProducts() { return this.prisma.mallProduct.findMany({ orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }] }); }
  suppliers() {
    return Object.values(SUPPLIERS).map((s) => ({ id: s.id, configured: s.configured, realValue: s.realValue, status: !s.configured ? 'NOT_CONFIGURED' : s.realValue && !this.rewardsLive ? 'BLOCKED_REWARDS_NOT_LIVE' : 'ACTIVE' }));
  }
  async adminUpsertProduct(adminId: string, dto: { id: string; category: string; brand: string; name: string; price: number; stock: number | null; perUserDaily: number; supplier: string; supplierSku?: string | null; status: 'ACTIVE' | 'HIDDEN'; sortOrder?: number }, ip?: string) {
    if (!MALL_CATEGORIES.some((c) => c.id === dto.category)) throw new AppError('INVALID_CATEGORY', '카테고리를 확인해주세요.');
    if (!Number.isInteger(dto.price) || dto.price < 100 || dto.price > 1_000_000) throw new AppError('INVALID_PRICE', '가격은 100~1,000,000P 사이 정수여야 해요.');
    if (dto.stock !== null && (!Number.isInteger(dto.stock) || dto.stock < 0)) throw new AppError('INVALID_STOCK', '재고를 확인해주세요.');
    if (!SUPPLIERS[dto.supplier]) throw new AppError('INVALID_SUPPLIER', '공급사를 확인해주세요.');
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.mallProduct.findUnique({ where: { id: dto.id } });
      const data = { category: dto.category, brand: dto.brand, name: dto.name, price: dto.price, stock: dto.stock, perUserDaily: dto.perUserDaily, supplier: dto.supplier, supplierSku: dto.supplierSku ?? null, status: dto.status, sortOrder: dto.sortOrder ?? 0 };
      const p = await tx.mallProduct.upsert({ where: { id: dto.id }, create: { id: dto.id, ...data }, update: data });
      await this.audit.log(tx, { actorId: adminId, action: before ? 'MALL_PRODUCT_UPDATE' : 'MALL_PRODUCT_CREATE', targetType: 'MallProduct', targetId: p.id, before: before ? { price: before.price, stock: before.stock, status: before.status } : undefined, after: { price: p.price, stock: p.stock, status: p.status }, ip });
      return p;
    });
  }
  async adminOrders(status?: string) {
    const rows = await this.prisma.mallOrder.findMany({ where: status ? { status: status as MallOrder['status'] } : {}, include: { product: true }, orderBy: { createdAt: 'desc' }, take: 300 });
    return rows.map((o) => ({ ...this.orderView(o), userId: o.userId, supplier: o.supplier }));
  }

  /** 관리자 취소(CS): 공급사 취소 → 포인트 역분개 → 재고 복구. 발급 완료 건만 */
  async adminCancel(adminId: string, orderId: string, reason: string, ip?: string) {
    if (!reason?.trim()) throw new AppError('NOTE_REQUIRED', '취소 사유를 입력해주세요.');
    const o = await this.prisma.mallOrder.findUnique({ where: { id: orderId }, include: { product: true } });
    if (!o) throw NotFound('교환 내역');
    if (o.status !== 'ISSUED') throw Conflict('NOT_CANCELLABLE', '발급 완료된 교환만 취소할 수 있어요.');
    await supplierFor(o.supplier).cancel(o.supplierRef ?? '');
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.mallOrder.updateMany({ where: { id: orderId, status: 'ISSUED' }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason.trim() } });
      if (!r.count) throw Conflict('NOT_CANCELLABLE', '이미 처리된 교환이에요.');
      await this.points.reverse(tx, o.ledgerEntryId!, `포인트몰 교환 취소 · ${o.product.brand} ${o.product.name}`, adminId);
      if (o.product.stock !== null) await tx.mallProduct.update({ where: { id: o.productId }, data: { stock: { increment: 1 } } });
      await this.notifications.notify(tx, { userId: o.userId, type: 'MALL_ORDER', title: '교환이 취소됐어요', body: `${o.product.brand} ${o.product.name} · ${o.price.toLocaleString('ko-KR')}P 가 복구됐어요.`, link: '/mall/coupons', dedupeKey: `mall-cancelled:${o.id}` });
      await this.audit.log(tx, { actorId: adminId, action: 'MALL_ORDER_CANCEL', targetType: 'MallOrder', targetId: o.id, after: { reason, refund: o.price }, ip });
      return { id: o.id, status: 'CANCELLED' as const };
    });
  }
}
