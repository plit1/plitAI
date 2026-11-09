import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PointsService } from '../src/modules/points/points.service';
import { MallService } from '../src/modules/mall/mall.service';
import { createApp, prisma, resetDb, signup } from './helpers';

let k = 0;
const key = () => `key-${Date.now()}-${k++}`;

describe('포인트몰 (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const balance = async (userId: string) => (await prisma.pointAccount.findUnique({ where: { userId } }))?.balance ?? 0;
  const grant = (userId: string, amount: number) => prisma.$transaction((tx) => app.get(PointsService).post(tx, { userId, type: 'EARN', amount, reason: '테스트 적립', dedupeKey: `test-grant:${userId}:${Date.now()}:${k++}` }));
  beforeAll(async () => {
    await resetDb(); app = await createApp();
    await prisma.mallProduct.createMany({ data: [
      { id: 'p-cafe-5', category: 'cafe', brand: '카페 A', name: '음료 5,000원', price: 5000, perUserDaily: 3, isDemo: true },
      { id: 'p-one', category: 'cvs', brand: '편의점 A', name: '하루 1개 상품', price: 1000, perUserDaily: 1 },
      { id: 'p-stock', category: 'book', brand: '서점', name: '재고 1개', price: 1000, stock: 1 },
      { id: 'p-fail', category: 'life', brand: '실패', name: '발급 실패 재현', price: 1000, supplierSku: 'TEST_FAIL', stock: 5 },
      { id: 'p-real', category: 'life', brand: '실공급사', name: '미연동', price: 1000, supplier: 'GIFTISHOW' },
      { id: 'p-hidden', category: 'life', brand: '숨김', name: '숨김 상품', price: 1000, status: 'HIDDEN' },
    ] });
  });
  afterAll(async () => { await app.close(); await prisma.$disconnect(); });

  it('상품 목록(공개): 숨김 제외, 테스트 쿠폰 고지', async () => {
    const r = (await http().get('/api/v1/mall/products').expect(200)).body;
    expect(r.items.map((p: any) => p.id)).not.toContain('p-hidden');
    expect(r.items.find((p: any) => p.id === 'p-cafe-5')).toMatchObject({ testCoupon: true, soldOut: false });
    expect(r.notice).toContain('테스트 쿠폰');
    expect((await http().get('/api/v1/mall/products?category=book').expect(200)).body.items.map((p: any) => p.id)).toEqual(['p-stock']);
  });

  it('잔액 부족 422 (주문·차감 없음) → 적립 후 교환: 포인트 차감·테스트 쿠폰 발급·알림, 같은 키 재요청·동시 요청은 1건', async () => {
    const u = await signup(app);
    expect((await http().post('/api/v1/mall/exchange').set(u.auth).send({ productId: 'p-cafe-5', idempotencyKey: key() }).expect(422)).body.code).toBe('INSUFFICIENT_POINTS');
    expect(await prisma.mallOrder.count({ where: { userId: u.id } })).toBe(0);
    await grant(u.id, 20000);
    const before = await balance(u.id);
    const kk = key();
    const results = await Promise.all(Array.from({ length: 5 }, () => http().post('/api/v1/mall/exchange').set(u.auth).send({ productId: 'p-cafe-5', idempotencyKey: kk })));
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    const o = results[0].body;
    expect(o).toMatchObject({ status: 'ISSUED', price: 5000, isTestCoupon: true });
    expect(o.couponCode).toMatch(/^TEST-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(await balance(u.id)).toBe(before - 5000);
    const row = await prisma.mallOrder.findUniqueOrThrow({ where: { id: o.id } });
    expect(row.couponCodeEnc).not.toContain(o.couponCode); // 암호화 저장
    expect((await http().get('/api/v1/me/notifications').set(u.auth).expect(200)).body.items[0]).toMatchObject({ type: 'MALL_ORDER' });
    const list = (await http().get('/api/v1/me/mall/orders').set(u.auth).expect(200)).body;
    expect(list[0].couponCode).toBeUndefined();
    expect((await http().get(`/api/v1/me/mall/orders/${o.id}`).set(u.auth).expect(200)).body.couponCode).toBe(o.couponCode);
    await http().get(`/api/v1/me/mall/orders/${o.id}`).set((await signup(app)).auth).expect(404);
  });

  it('상품별 하루 한도 429, 재고 1개 동시 교환은 1명만, 숨김·미연동 공급사 차단', async () => {
    const u = await signup(app); await grant(u.id, 10000);
    await http().post('/api/v1/mall/exchange').set(u.auth).send({ productId: 'p-one', idempotencyKey: key() }).expect(201);
    expect((await http().post('/api/v1/mall/exchange').set(u.auth).send({ productId: 'p-one', idempotencyKey: key() }).expect(429)).body.code).toBe('PRODUCT_DAILY_LIMIT');
    const a = await signup(app), b = await signup(app); await grant(a.id, 5000); await grant(b.id, 5000);
    const [ra, rb] = await Promise.all([a, b].map((x) => http().post('/api/v1/mall/exchange').set(x.auth).send({ productId: 'p-stock', idempotencyKey: key() })));
    expect([ra.status, rb.status].sort()).toEqual([201, 409]);
    expect((await prisma.mallProduct.findUniqueOrThrow({ where: { id: 'p-stock' } })).stock).toBe(0);
    expect((await http().get('/api/v1/mall/products').expect(200)).body.items.find((p: any) => p.id === 'p-stock').soldOut).toBe(true);
    await http().post('/api/v1/mall/exchange').set(u.auth).send({ productId: 'p-hidden', idempotencyKey: key() }).expect(404);
    expect((await http().post('/api/v1/mall/exchange').set(u.auth).send({ productId: 'p-real', idempotencyKey: key() }).expect(503)).body.code).toBe('SUPPLIER_NOT_CONFIGURED');
  });

  it('발급 실패: 502 + 주문 FAILED + 포인트 역분개 + 재고 복구', async () => {
    const u = await signup(app); await grant(u.id, 5000);
    const before = await balance(u.id);
    const r = await http().post('/api/v1/mall/exchange').set(u.auth).send({ productId: 'p-fail', idempotencyKey: key() }).expect(502);
    expect(r.body.code).toBe('ISSUE_FAILED');
    const o = await prisma.mallOrder.findFirstOrThrow({ where: { userId: u.id } });
    expect(o.status).toBe('FAILED');
    expect(await balance(u.id)).toBe(before);
    expect(await prisma.pointLedgerEntry.count({ where: { userId: u.id, type: 'REVERSAL' } })).toBe(1);
    expect((await prisma.mallProduct.findUniqueOrThrow({ where: { id: 'p-fail' } })).stock).toBe(5);
  });

  it('관리자: 취소(사유 필수)→포인트 복구·알림·감사, 재취소 409 / 상품 수정은 SUPER_ADMIN / 발급 대기 복구', async () => {
    const u = await signup(app); await grant(u.id, 10000);
    const o = (await http().post('/api/v1/mall/exchange').set(u.auth).send({ productId: 'p-cafe-5', idempotencyKey: key() }).expect(201)).body;
    const op = await signup(app, { role: 'OPERATOR' });
    const before = await balance(u.id);
    await http().post(`/api/v1/admin/mall/orders/${o.id}/cancel`).set(op.auth).send({}).expect(400);
    await http().post(`/api/v1/admin/mall/orders/${o.id}/cancel`).set(op.auth).send({ reason: '고객 요청' }).expect(201);
    expect(await balance(u.id)).toBe(before + 5000);
    await http().post(`/api/v1/admin/mall/orders/${o.id}/cancel`).set(op.auth).send({ reason: '고객 요청' }).expect(409);
    expect(await prisma.adminAuditLog.count({ where: { action: 'MALL_ORDER_CANCEL', targetId: o.id } })).toBe(1);
    expect((await http().get(`/api/v1/me/mall/orders/${o.id}`).set(u.auth).expect(200)).body.couponCode).toBeUndefined();

    const dto = { id: 'p-new', category: 'cafe', brand: '카페 N', name: '신상품', price: 3000, stock: 10, perUserDaily: 2, supplier: 'TEST', status: 'ACTIVE' };
    await http().put('/api/v1/admin/mall/products').set(op.auth).send(dto).expect(403);
    const sa = await signup(app, { role: 'SUPER_ADMIN' });
    expect((await http().put('/api/v1/admin/mall/products').set(sa.auth).send({ ...dto, price: 50 }).expect(400)).body.code).toBe('INVALID_PRICE');
    await http().put('/api/v1/admin/mall/products').set(sa.auth).send(dto).expect(200);
    expect((await http().get('/api/v1/admin/mall/suppliers').set(op.auth).expect(200)).body.find((s: any) => s.id === 'GIFTISHOW').status).toBe('NOT_CONFIGURED');

    // 발급 대기로 남은 주문 (차감 후 서버 중단 재현) → 복구
    const v = await signup(app); await grant(v.id, 5000);
    const vb = await balance(v.id);
    const stuck = await prisma.$transaction(async (tx) => {
      const ord = await tx.mallOrder.create({ data: { userId: v.id, productId: 'p-cafe-5', price: 5000, idempotencyKey: key(), supplier: 'TEST', createdAt: new Date(Date.now() - 20 * 60000) } });
      const { entry } = await app.get(PointsService).post(tx, { userId: v.id, type: 'SPEND', amount: -5000, reason: '교환', dedupeKey: `exchange:${ord.id}` });
      return tx.mallOrder.update({ where: { id: ord.id }, data: { ledgerEntryId: entry.id } });
    });
    expect(await balance(v.id)).toBe(vb - 5000);
    expect((await app.get(MallService).recoverStuck()).recovered).toBe(1);
    expect((await prisma.mallOrder.findUniqueOrThrow({ where: { id: stuck.id } })).status).toBe('FAILED');
    expect(await balance(v.id)).toBe(vb);
    expect((await app.get(MallService).recoverStuck()).recovered).toBe(0);
  });
});
