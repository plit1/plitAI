import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PAYMENT_PROVIDER, PaymentProvider } from '../src/modules/payments/payment-provider';
import { createApp, prisma, resetDb, signup } from './helpers';

describe('정산 리포트·대사 (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => { await resetDb(); app = await createApp(); });
  afterAll(async () => { await app.close(); await prisma.$disconnect(); });

  async function paidOrder() {
    const u = await signup(app);
    const o = await http().post('/api/v1/payments/orders').set(u.auth).send({ offeringId: 'is-open' }).expect(201);
    await http().post('/api/v1/payments/confirm').set(u.auth).send({ orderNo: o.body.orderNo, paymentKey: `mock_ok_${o.body.orderNo}`, amount: 29000 }).expect(200);
    return { u, orderNo: o.body.orderNo as string };
  }
  const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

  it('매출: 결제 2·환불 1 → 순매출·부가세, 테스트 주문은 기본 제외', async () => {
    await paidOrder(); const b = await paidOrder();
    await http().post(`/api/v1/payments/orders/${b.orderNo}/refund`).set(b.u.auth).expect(200);
    const op = await signup(app, { role: 'OPERATOR' });
    const base = `/api/v1/admin/settlement/revenue?from=${today()}&to=${today()}`;
    expect((await http().get(base).set(op.auth).expect(200)).body.total.paidCount).toBe(0); // MOCK 주문은 isTest=true
    const r = await http().get(`${base}&includeTest=true`).set(op.auth).expect(200);
    expect(r.body.total).toMatchObject({ paidCount: 2, paidAmount: 58000, refundCount: 1, refundAmount: 29000, netAmount: 29000, supply: 26364, vat: 2636 });
    expect(r.body.rows[0].period).toBe(today());
  });

  it('CSV 다운로드: 첨부·BOM·합계 행', async () => {
    const op = await signup(app, { role: 'OPERATOR' });
    const r = await http().get(`/api/v1/admin/settlement/revenue.csv?from=${today()}&to=${today()}&includeTest=true`).set(op.auth).expect(200);
    expect(r.headers['content-type']).toContain('text/csv');
    expect(r.headers['content-disposition']).toContain('attachment; filename="plit-revenue-');
    expect(r.text.charCodeAt(0)).toBe(0xfeff);
    expect(r.text).toMatch(/합계,2,58000,1,29000,29000,26364,2636/);
  });

  it('기간 검증·권한', async () => {
    const op = await signup(app, { role: 'OPERATOR' });
    expect((await http().get('/api/v1/admin/settlement/revenue?from=2026-12-01&to=2026-11-01').set(op.auth).expect(400)).body.code).toBe('INVALID_RANGE');
    expect((await http().get('/api/v1/admin/settlement/revenue?from=2025-01-01&to=2026-12-31').set(op.auth).expect(400)).body.code).toBe('INVALID_RANGE');
    await http().get(`/api/v1/admin/settlement/revenue?from=${today()}&to=${today()}`).set((await signup(app)).auth).expect(403);
  });

  it('포인트: 유형별 집계·미사용 잔액(부채)', async () => {
    const op = await signup(app, { role: 'OPERATOR' });
    const r = await http().get(`/api/v1/admin/settlement/points?from=${today()}&to=${today()}`).set(op.auth).expect(200);
    const users = await prisma.user.count();
    expect(r.body.rows[0].EARN).toBe(users * 3500);
    expect(r.body.outstandingBalance).toBe(users * 3500);
    expect(r.body.outstandingLive).toBe(0); // REWARDS_LIVE=false → 실제 가치 포인트 없음
  });

  it('대사: 승인 응답 유실 주문 확정 · PG 에 없는 결제 FAILED · 24시간 방치 주문 만료', async () => {
    const pg = app.get<PaymentProvider>(PAYMENT_PROVIDER);
    const old = new Date(Date.now() - 10 * 60_000);
    // 1) PG 는 승인했지만 서버가 응답을 못 받은 주문
    const u1 = await signup(app);
    const o1 = await http().post('/api/v1/payments/orders').set(u1.auth).send({ offeringId: 'is-open' }).expect(201);
    await pg.confirm({ paymentKey: 'lost_resp_1', orderId: o1.body.orderNo, amount: 29000 });
    await prisma.order.update({ where: { orderNo: o1.body.orderNo }, data: { paymentKey: 'lost_resp_1', createdAt: old } });
    // 2) 결제키는 있으나 PG 에 결제 없음
    const u2 = await signup(app);
    const o2 = await http().post('/api/v1/payments/orders').set(u2.auth).send({ offeringId: 'is-open' }).expect(201);
    await prisma.order.update({ where: { orderNo: o2.body.orderNo }, data: { paymentKey: 'ghost_key', createdAt: old } });
    // 3) 결제창 이탈 25시간
    const u3 = await signup(app);
    const o3 = await http().post('/api/v1/payments/orders').set(u3.auth).send({ offeringId: 'is-open' }).expect(201);
    await prisma.order.update({ where: { orderNo: o3.body.orderNo }, data: { createdAt: new Date(Date.now() - 25 * 3600_000) } });

    const sa = await signup(app, { role: 'SUPER_ADMIN' });
    const r = await http().post('/api/v1/admin/settlement/reconcile').set(sa.auth).expect(200);
    expect(r.body).toMatchObject({ confirmed: 1, failed: 1, expired: 1 });
    const [a, b, c] = await Promise.all([o1, o2, o3].map((o) => prisma.order.findUniqueOrThrow({ where: { orderNo: o.body.orderNo }, include: { pass: true } })));
    expect(a.status).toBe('PAID'); expect(a.pass?.status).toBe('ACTIVE');
    expect(b.status).toBe('FAILED');
    expect(c.status).toBe('CANCELLED');
    // 재실행 무변경
    expect((await http().post('/api/v1/admin/settlement/reconcile').set(sa.auth).expect(200)).body).toMatchObject({ confirmed: 0, failed: 0, expired: 0 });
  });
});
