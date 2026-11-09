import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, prisma, resetDb, signup } from './helpers';

describe('MODULE 03/04/09 챌린지·부스터 패스·결제 (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => { await resetDb(); app = await createApp(); });
  afterAll(async () => { await app.close(); await prisma.$disconnect(); });

  describe('챌린지 참여', () => {
    it('플릿런(FREE) 참여 → 정책 버전·보상 스냅샷 기록, 학습기록 생성', async () => {
      const u = await signup(app);
      const r = await http().post('/api/v1/challenges/is-open/join').set(u.auth).send({ plan: 'FREE' }).expect(201);
      expect(r.body.enrollment).toMatchObject({ plan: 'FREE', policyVersion: '2026-10-v2.2', rewardSnapshot: 2000 });
      expect(await prisma.studyRecord.count({ where: { enrollmentId: r.body.enrollment.id } })).toBe(1);
      const o = await prisma.challengeOffering.findUniqueOrThrow({ where: { id: 'is-open' } });
      expect(o.freeJoined).toBe(1);
    });

    it('같은 회차 중복 참여 409', async () => {
      const u = await signup(app);
      await http().post('/api/v1/challenges/is-open/join').set(u.auth).send({ plan: 'FREE' }).expect(201);
      const r = await http().post('/api/v1/challenges/is-open/join').set(u.auth).send({ plan: 'FREE' }).expect(409);
      expect(r.body.code).toBe('ALREADY_JOINED');
    });

    it('모집 마감 회차 참여 불가', async () => {
      const u = await signup(app);
      const r = await http().post('/api/v1/challenges/is-closed/join').set(u.auth).send({ plan: 'FREE' }).expect(400);
      expect(r.body.code).toBe('RECRUIT_CLOSED');
    });

    it('부스터 패스 없이 PREMIUM 참여 → 402 PASS_REQUIRED', async () => {
      const u = await signup(app);
      const r = await http().post('/api/v1/challenges/is-open/join').set(u.auth).send({ plan: 'PREMIUM' }).expect(402);
      expect(r.body.code).toBe('PASS_REQUIRED');
    });

    it('정원 3명 회차에 8명 동시 신청 → 정확히 3명만 성공', async () => {
      const users = await Promise.all(Array.from({ length: 8 }, () => signup(app)));
      const results = await Promise.all(users.map((u) => http().post('/api/v1/challenges/is-small/join').set(u.auth).send({ plan: 'FREE' })));
      const ok = results.filter((r) => r.status === 201).length;
      const full = results.filter((r) => r.status === 409 && r.body.code === 'CAPACITY_FULL').length;
      expect(ok).toBe(3);
      expect(full).toBe(5);
      const o = await prisma.challengeOffering.findUniqueOrThrow({ where: { id: 'is-small' } });
      expect(o.freeJoined).toBe(3);
      expect(await prisma.enrollment.count({ where: { offeringId: 'is-small' } })).toBe(3);
    });

    it('FREE 참여자는 QUICK TEST 등 프리미엄 기능 접근 불가 (서버 검사)', async () => {
      const u = await signup(app);
      const j = await http().post('/api/v1/challenges/is-open/join').set(u.auth).send({ plan: 'FREE' }).expect(201);
      const ent = app.get((await import('../src/modules/challenges/entitlement.service')).EntitlementService);
      await expect(ent.require(u.id, j.body.enrollment.id, 'QUICK_TEST')).rejects.toMatchObject({ code: 'PREMIUM_REQUIRED' });
      await expect(ent.require(u.id, j.body.enrollment.id, 'TODAY_STUDY')).resolves.toBeTruthy();
    });

    it('타인 참여 기록 대시보드 접근 → 404 (존재 여부 비노출)', async () => {
      const a = await signup(app); const b = await signup(app);
      const j = await http().post('/api/v1/challenges/is-open/join').set(a.auth).send({ plan: 'FREE' }).expect(201);
      await http().get(`/api/v1/enrollments/${j.body.enrollment.id}/dashboard`).set(b.auth).expect(404);
      const d = await http().get(`/api/v1/enrollments/${j.body.enrollment.id}/dashboard`).set(a.auth).expect(200);
      expect(d.body.index.label).toBe('PLIT 도전 지표 (추정)');
      expect(d.body.index.disclaimer).toContain('실제 합격 확률이 아니에요');
      expect(d.body.comparison.wdl).toMatchObject({ status: 'UNAVAILABLE', reason: 'COLLECTING' }); // 표본 10명 미만
    });
  });

  describe('부스터 패스 결제 (MOCK PG)', () => {
    it('주문 금액은 서버 정책값(29,000원), PENDING 주문 재사용', async () => {
      const u = await signup(app);
      const a = await http().post('/api/v1/payments/orders').set(u.auth).send({ offeringId: 'is-open' }).expect(201);
      expect(a.body).toMatchObject({ amount: 29000, vatIncluded: true, reused: false, provider: 'MOCK' });
      expect(a.body.orderNo).toMatch(/^[A-Za-z0-9_=-]{6,64}$/); // 토스 orderId 규칙
      expect(a.body.customerKey).toMatch(/^plit_[A-Za-z0-9_-]{32}$/); // 회원 ID 비노출
      const b = await http().post('/api/v1/payments/orders').set(u.auth).send({ offeringId: 'is-open' }).expect(201);
      expect(b.body).toMatchObject({ orderNo: a.body.orderNo, reused: true });
    });

    it('클라이언트 금액 위변조 → PG 호출 없이 거절', async () => {
      const u = await signup(app);
      const o = await http().post('/api/v1/payments/orders').set(u.auth).send({ offeringId: 'is-open' }).expect(201);
      const r = await http().post('/api/v1/payments/confirm').set(u.auth).send({ orderNo: o.body.orderNo, paymentKey: 'mock_ok_tamper', amount: 100 }).expect(400);
      expect(r.body.code).toBe('AMOUNT_MISMATCH');
      const order = await prisma.order.findUniqueOrThrow({ where: { orderNo: o.body.orderNo } });
      expect(order).toMatchObject({ status: 'PENDING', paymentKey: null });
    });

    it('남의 주문 승인 시도 → 404', async () => {
      const a = await signup(app); const b = await signup(app);
      const o = await http().post('/api/v1/payments/orders').set(a.auth).send({ offeringId: 'is-open' }).expect(201);
      await http().post('/api/v1/payments/confirm').set(b.auth).send({ orderNo: o.body.orderNo, paymentKey: 'mock_ok_x', amount: 29000 }).expect(404);
    });

    it('FREE 참여 → 결제 승인 → 패스 발급 + PREMIUM 자동 전환(보상 20,000P 스냅샷), 재승인 멱등', async () => {
      const u = await signup(app);
      const j = await http().post('/api/v1/challenges/is-open/join').set(u.auth).send({ plan: 'FREE' }).expect(201);
      const o = await http().post('/api/v1/payments/orders').set(u.auth).send({ offeringId: 'is-open' }).expect(201);
      const key = `mock_ok_${o.body.orderNo}`;
      const c = await http().post('/api/v1/payments/confirm').set(u.auth).send({ orderNo: o.body.orderNo, paymentKey: key, amount: 29000 }).expect(200);
      expect(c.body).toMatchObject({ status: 'PAID', idempotent: false });
      expect(c.body.pass.status).toBe('ACTIVE');
      const e = await prisma.enrollment.findUniqueOrThrow({ where: { id: j.body.enrollment.id } });
      expect(e).toMatchObject({ plan: 'PREMIUM', rewardSnapshot: 20000, passId: c.body.pass.id });
      const again = await http().post('/api/v1/payments/confirm').set(u.auth).send({ orderNo: o.body.orderNo, paymentKey: key, amount: 29000 }).expect(200);
      expect(again.body.idempotent).toBe(true);
      expect(await prisma.boosterPass.count({ where: { userId: u.id } })).toBe(1);
      // 같은 회차 재구매 차단
      const dup = await http().post('/api/v1/payments/orders').set(u.auth).send({ offeringId: 'is-open' }).expect(409);
      expect(dup.body.code).toBe('DUPLICATE_PASS');
    });

    it('동시 승인 요청 5건 → 패스 1개만 발급', async () => {
      const u = await signup(app);
      const o = await http().post('/api/v1/payments/orders').set(u.auth).send({ offeringId: 'is-open' }).expect(201);
      const key = `mock_ok_conc_${o.body.orderNo}`;
      const rs = await Promise.all(Array.from({ length: 5 }, () => http().post('/api/v1/payments/confirm').set(u.auth).send({ orderNo: o.body.orderNo, paymentKey: key, amount: 29000 })));
      expect(rs.filter((r) => r.status === 200).length).toBeGreaterThanOrEqual(1);
      expect(rs.every((r) => r.status === 200 || r.status === 409)).toBe(true);
      expect(await prisma.boosterPass.count({ where: { userId: u.id } })).toBe(1);
      expect((await prisma.order.findUniqueOrThrow({ where: { orderNo: o.body.orderNo } })).status).toBe('PAID');
    });

    it('패스 보유 후 PREMIUM 신규 참여 가능', async () => {
      const u = await signup(app);
      const o = await http().post('/api/v1/payments/orders').set(u.auth).send({ offeringId: 'is-open' }).expect(201);
      await http().post('/api/v1/payments/confirm').set(u.auth).send({ orderNo: o.body.orderNo, paymentKey: `mock_ok_${o.body.orderNo}`, amount: 29000 }).expect(200);
      const j = await http().post('/api/v1/challenges/is-open/join').set(u.auth).send({ plan: 'PREMIUM' }).expect(201);
      expect(j.body.enrollment).toMatchObject({ plan: 'PREMIUM', rewardSnapshot: 20000 });
      const ent = app.get((await import('../src/modules/challenges/entitlement.service')).EntitlementService);
      await expect(ent.require(u.id, j.body.enrollment.id, 'QUICK_TEST')).resolves.toBeTruthy();
    });

    it('카드 거절 → FAILED, 네트워크 오류 → 503 + PENDING 유지(결제키 선점), 다른 결제키 끼어들기 409', async () => {
      const u = await signup(app);
      const o1 = await http().post('/api/v1/payments/orders').set(u.auth).send({ offeringId: 'is-open' }).expect(201);
      const f = await http().post('/api/v1/payments/confirm').set(u.auth).send({ orderNo: o1.body.orderNo, paymentKey: 'mock_fail_card', amount: 29000 }).expect(402);
      expect(f.body.code).toBe('PAYMENT_FAILED');
      expect((await prisma.order.findUniqueOrThrow({ where: { orderNo: o1.body.orderNo } })).status).toBe('FAILED');

      const u2 = await signup(app);
      const o2 = await http().post('/api/v1/payments/orders').set(u2.auth).send({ offeringId: 'is-open' }).expect(201);
      const n = await http().post('/api/v1/payments/confirm').set(u2.auth).send({ orderNo: o2.body.orderNo, paymentKey: 'mock_net_1', amount: 29000 }).expect(503);
      expect(n.body.code).toBe('PG_UNAVAILABLE');
      expect((await prisma.order.findUniqueOrThrow({ where: { orderNo: o2.body.orderNo } })).status).toBe('PENDING');
      // 다른 결제키로 끼어들기 불가
      await http().post('/api/v1/payments/confirm').set(u2.auth).send({ orderNo: o2.body.orderNo, paymentKey: 'mock_ok_other', amount: 29000 }).expect(409);
    });

    it('사용자 환불 → PG 취소, 패스 회수, 플릿런 전환, 중복 환불 멱등', async () => {
      const u = await signup(app);
      const admin = await signup(app, { role: 'SUPER_ADMIN' });
      await http().post('/api/v1/challenges/is-open/join').set(u.auth).send({ plan: 'FREE' }).expect(201);
      const o = await http().post('/api/v1/payments/orders').set(u.auth).send({ offeringId: 'is-open' }).expect(201);
      await http().post('/api/v1/payments/confirm').set(u.auth).send({ orderNo: o.body.orderNo, paymentKey: `mock_ok_${o.body.orderNo}`, amount: 29000 }).expect(200);

      const r = await http().post(`/api/v1/payments/orders/${o.body.orderNo}/refund`).set(u.auth).expect(200);
      expect(r.body.status).toBe('REFUNDED');
      const pass = await prisma.boosterPass.findFirstOrThrow({ where: { userId: u.id } });
      expect(pass.status).toBe('REVOKED');
      const e = await prisma.enrollment.findFirstOrThrow({ where: { userId: u.id }, include: { planHistory: true } });
      expect(e.plan).toBe('FREE');
      expect(e.rewardSnapshot).toBe(2000);
      expect(e.planHistory.map((h) => `${h.fromPlan}>${h.toPlan}`)).toEqual(['FREE>PREMIUM', 'PREMIUM>FREE']);
      const again = await http().post(`/api/v1/admin/orders/${o.body.orderNo}/refund`).set(admin.auth).send({ reason: '재시도' }).expect(201);
      expect(again.body.idempotent).toBe(true);
      // 환불 후 재구매 가능
      await http().post('/api/v1/payments/orders').set(u.auth).send({ offeringId: 'is-open' }).expect(201);
    });

    it('관리자 환불(SUPER_ADMIN 전용) → 감사 로그 기록, OPERATOR 는 403', async () => {
      const u = await signup(app);
      const op = await signup(app, { role: 'OPERATOR' });
      const admin = await signup(app, { role: 'SUPER_ADMIN' });
      const o = await http().post('/api/v1/payments/orders').set(u.auth).send({ offeringId: 'is-open' }).expect(201);
      await http().post('/api/v1/payments/confirm').set(u.auth).send({ orderNo: o.body.orderNo, paymentKey: `mock_ok_${o.body.orderNo}`, amount: 29000 }).expect(200);
      await http().post(`/api/v1/admin/orders/${o.body.orderNo}/refund`).set(op.auth).send({ reason: '고객 요청' }).expect(403);
      const r = await http().post(`/api/v1/admin/orders/${o.body.orderNo}/refund`).set(admin.auth).send({ reason: '고객 요청' }).expect(201);
      expect(r.body.status).toBe('REFUNDED');
      const order = await prisma.order.findUniqueOrThrow({ where: { orderNo: o.body.orderNo } });
      const log = await prisma.adminAuditLog.findFirstOrThrow({ where: { targetId: order.id, action: 'ORDER_REFUND' } });
      expect(log.actorId).toBe(admin.id);
    });

    it('환불 기간(7일) 경과 시 사용자 직접 환불 불가', async () => {
      const u = await signup(app);
      const o = await http().post('/api/v1/payments/orders').set(u.auth).send({ offeringId: 'is-open' }).expect(201);
      await http().post('/api/v1/payments/confirm').set(u.auth).send({ orderNo: o.body.orderNo, paymentKey: `mock_ok_${o.body.orderNo}`, amount: 29000 }).expect(200);
      await prisma.order.update({ where: { orderNo: o.body.orderNo }, data: { approvedAt: new Date(Date.now() - 9 * 86400000) } });
      const r = await http().post(`/api/v1/payments/orders/${o.body.orderNo}/refund`).set(u.auth).expect(403);
      expect(r.body.code).toBe('REFUND_PERIOD_OVER');
    });

    it('웹훅은 본문을 신뢰하지 않고 PG 조회로 재검증, 같은 이벤트 중복 수신 무시', async () => {
      const u = await signup(app);
      const o = await http().post('/api/v1/payments/orders').set(u.auth).send({ offeringId: 'is-open' }).expect(201);
      // 위조 웹훅 (PG에 존재하지 않는 결제키)
      await http().post('/api/v1/payments/webhooks/toss').set('tosspayments-webhook-transmission-id', 'evt-fake').send({ eventType: 'PAYMENT_STATUS_CHANGED', data: { paymentKey: 'forged', orderId: o.body.orderNo, status: 'DONE' } }).expect(200);
      expect((await prisma.order.findUniqueOrThrow({ where: { orderNo: o.body.orderNo } })).status).toBe('PENDING');
      const dup = await http().post('/api/v1/payments/webhooks/toss').set('tosspayments-webhook-transmission-id', 'evt-fake').send({ data: { paymentKey: 'forged', orderId: o.body.orderNo } }).expect(200);
      expect(dup.body.duplicate).toBe(true);
    });
  });
});
