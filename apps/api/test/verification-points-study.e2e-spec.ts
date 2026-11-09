import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PointsService } from '../src/modules/points/points.service';
import { createApp, prisma, resetDb, signup } from './helpers';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);

describe('MODULE 05/07/08 학습·합격 인증·포인트 원장 (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => { process.env.UPLOAD_DIR = '/tmp/plit-test-uploads'; await resetDb(); app = await createApp(); });
  afterAll(async () => { await app.close(); await prisma.$disconnect(); });

  async function enrolled(plan: 'FREE' | 'PREMIUM' = 'FREE') {
    const u = await signup(app);
    if (plan === 'PREMIUM') {
      const o = await http().post('/api/v1/payments/orders').set(u.auth).send({ offeringId: 'is-open' }).expect(201);
      await http().post('/api/v1/payments/confirm').set(u.auth).send({ orderNo: o.body.orderNo, paymentKey: `mock_ok_${o.body.orderNo}`, amount: 29000 }).expect(200);
    }
    const j = await http().post('/api/v1/challenges/is-open/join').set(u.auth).send({ plan }).expect(201);
    return { ...u, enrollmentId: j.body.enrollment.id as string };
  }
  const examPassed = () => prisma.challengeOffering.update({ where: { id: 'is-open' }, data: { examDate: new Date(Date.now() - 86400000) } });
  const examFuture = () => prisma.challengeOffering.update({ where: { id: 'is-open' }, data: { examDate: new Date(Date.now() + 60 * 86400000) } });

  describe('학습 세션', () => {
    it('1분 미만 완료 거절 → 30분 완료 시 기록·진도·XP 반영, 중복 완료 409', async () => {
      const u = await enrolled();
      const s = await http().post(`/api/v1/enrollments/${u.enrollmentId}/sessions`).set(u.auth).expect(201);
      const again = await http().post(`/api/v1/enrollments/${u.enrollmentId}/sessions`).set(u.auth).expect(201);
      expect(again.body.id).toBe(s.body.id); // 진행 중 세션 재사용
      const short = await http().post(`/api/v1/sessions/${s.body.id}/complete`).set(u.auth).expect(400);
      expect(short.body.code).toBe('TOO_SHORT');
      await prisma.studySession.update({ where: { id: s.body.id }, data: { resumedAt: new Date(Date.now() - 30 * 60000 - 5000) } });
      const done = await http().post(`/api/v1/sessions/${s.body.id}/complete`).set(u.auth).expect(200);
      expect(done.body).toMatchObject({ minutes: 30, xp: 25, streak: 1, progress: 0.5 });
      expect(done.body.missionCleared).toContain('첫 학습 30분');
      await http().post(`/api/v1/sessions/${s.body.id}/complete`).set(u.auth).expect(409);
      const d = await http().get(`/api/v1/enrollments/${u.enrollmentId}/dashboard`).set(u.auth).expect(200);
      expect(d.body.record.totalMin).toBe(30);
      expect(d.body.record.weekMin).toBe(30);
      expect(d.body.index.value).toBeGreaterThanOrEqual(5);
      expect(await prisma.xpLedgerEntry.count({ where: { userId: u.id } })).toBe(1);
      expect(await prisma.pointLedgerEntry.count({ where: { userId: u.id } })).toBe(1); // XP 는 포인트 원장과 분리
    });

    it('일시정지 구간은 공부 시간에서 제외', async () => {
      const u = await enrolled();
      const s = await http().post(`/api/v1/enrollments/${u.enrollmentId}/sessions`).set(u.auth).expect(201);
      await prisma.studySession.update({ where: { id: s.body.id }, data: { resumedAt: new Date(Date.now() - 10 * 60000) } });
      const p = await http().post(`/api/v1/sessions/${s.body.id}/pause`).set(u.auth).expect(200);
      expect(p.body.status).toBe('PAUSED');
      expect(Math.round(p.body.elapsedSec / 60)).toBe(10);
      await http().post(`/api/v1/sessions/${s.body.id}/resume`).set(u.auth).expect(200);
      const done = await http().post(`/api/v1/sessions/${s.body.id}/complete`).set(u.auth).expect(200);
      expect(done.body.minutes).toBe(10);
    });

    it('1회 600분 초과 세션은 INVALID 처리, 기록 미반영', async () => {
      const u = await enrolled();
      const s = await http().post(`/api/v1/enrollments/${u.enrollmentId}/sessions`).set(u.auth).expect(201);
      await prisma.studySession.update({ where: { id: s.body.id }, data: { resumedAt: new Date(Date.now() - 11 * 3600000) } });
      const r = await http().post(`/api/v1/sessions/${s.body.id}/complete`).set(u.auth).expect(422);
      expect(r.body.code).toBe('SESSION_TOO_LONG');
      const row = await prisma.studySession.findUniqueOrThrow({ where: { id: s.body.id } });
      expect(row.status).toBe('INVALID');
      // 새 세션을 시작할 수 있어야 함 (INVALID 세션이 진행 중으로 남지 않음)
      const next = await http().post(`/api/v1/enrollments/${u.enrollmentId}/sessions`).set(u.auth).expect(201);
      expect(next.body.id).not.toBe(s.body.id);
      expect((await prisma.studyRecord.findUniqueOrThrow({ where: { enrollmentId: u.enrollmentId } })).totalMin).toBe(0);
    });
  });

  describe('합격 인증 → 보상', () => {
    it('시험 전 제출 불가, 잘못된 파일 형식 거절', async () => {
      await examFuture();
      const u = await enrolled();
      const up = await http().post('/api/v1/uploads/evidence').set(u.auth).attach('file', PNG, 'a.png').expect(201);
      const r = await http().post(`/api/v1/enrollments/${u.enrollmentId}/verification`).set(u.auth).send({ examNumber: '123456789', evidenceKey: up.body.key }).expect(400);
      expect(r.body.code).toBe('EXAM_NOT_FINISHED');
      const bad = await http().post('/api/v1/uploads/evidence').set(u.auth).attach('file', Buffer.from('<script>alert(1)</script>'), 'x.png').expect(400);
      expect(bad.body.code).toBe('FILE_TYPE');
    });

    it('부스터 패스 합격 승인 → 20,000P 1회 지급(가상), XP, 감사 로그 / 재심사 409', async () => {
      await examFuture();
      const u = await enrolled('PREMIUM');
      const op = await signup(app, { role: 'OPERATOR' });
      await examPassed();
      const up = await http().post('/api/v1/uploads/evidence').set(u.auth).attach('file', PNG, 'pass.png').expect(201);
      expect(up.body.key).toMatch(new RegExp(`^evidence/${u.id}/`));
      const sub = await http().post(`/api/v1/enrollments/${u.enrollmentId}/verification`).set(u.auth).send({ examNumber: '2027-0012-3456', evidenceKey: up.body.key }).expect(201);
      await http().post(`/api/v1/enrollments/${u.enrollmentId}/verification`).set(u.auth).send({ examNumber: '2027-0012-3456', evidenceKey: up.body.key }).expect(409);
      const v = await prisma.passVerification.findUniqueOrThrow({ where: { id: sub.body.id } });
      expect(v.examNumber).toBe('********3456'); // 뒤 4자리만 보관

      await http().post(`/api/v1/admin/verifications/${sub.body.id}/review`).set(u.auth).send({ decision: 'APPROVE' }).expect(403); // 일반 회원
      const r = await http().post(`/api/v1/admin/verifications/${sub.body.id}/review`).set(op.auth).send({ decision: 'APPROVE' }).expect(201);
      expect(r.body).toMatchObject({ status: 'APPROVED', reward: 20000 });
      await http().post(`/api/v1/admin/verifications/${sub.body.id}/review`).set(op.auth).send({ decision: 'APPROVE' }).expect(409);

      const ledger = await prisma.pointLedgerEntry.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'asc' } });
      expect(ledger.map((l) => l.amount)).toEqual([3500, 20000]);
      expect(ledger[1]).toMatchObject({ isVirtual: true, dedupeKey: `reward:${u.enrollmentId}`, balanceAfter: 23500 });
      expect(await prisma.xpLedgerEntry.count({ where: { userId: u.id, sourceType: 'clear' } })).toBe(1);
      expect(await prisma.adminAuditLog.count({ where: { targetId: sub.body.id, action: 'VERIFICATION_APPROVE' } })).toBe(1);
      const audit = await http().get(`/api/v1/admin/users/${u.id}/points/audit`).set(op.auth).expect(200);
      expect(audit.body).toMatchObject({ cached: 23500, ledger: 23500, consistent: true });
    });

    it('보완 요청(사유 필수) → 재제출 → 불합격 확인 시 0P 결과 기록 → 이의신청', async () => {
      await examFuture();
      const u = await enrolled();
      const op = await signup(app, { role: 'OPERATOR' });
      await examPassed();
      const up = await http().post('/api/v1/uploads/evidence').set(u.auth).attach('file', PNG, 'p.png').expect(201);
      const sub = await http().post(`/api/v1/enrollments/${u.enrollmentId}/verification`).set(u.auth).send({ examNumber: '99998888', evidenceKey: up.body.key }).expect(201);
      await http().post(`/api/v1/admin/verifications/${sub.body.id}/review`).set(op.auth).send({ decision: 'NEEDS_FIX' }).expect(400);
      await http().post(`/api/v1/admin/verifications/${sub.body.id}/review`).set(op.auth).send({ decision: 'NEEDS_FIX', note: '수험번호가 가려져 있어요' }).expect(201);
      const mine = await http().get(`/api/v1/enrollments/${u.enrollmentId}/verification`).set(u.auth).expect(200);
      expect(mine.body).toMatchObject({ status: 'NEEDS_FIX', note: '수험번호가 가려져 있어요' });
      await http().post(`/api/v1/enrollments/${u.enrollmentId}/verification`).set(u.auth).send({ examNumber: '99998888', evidenceKey: up.body.key }).expect(201);
      const f = await http().post(`/api/v1/admin/verifications/${sub.body.id}/review`).set(op.auth).send({ decision: 'FAIL' }).expect(201);
      expect(f.body.reward).toBe(0);
      const result = await prisma.pointLedgerEntry.findUniqueOrThrow({ where: { dedupeKey: `fail:${u.enrollmentId}` } });
      expect(result).toMatchObject({ type: 'RESULT', amount: 0 });
      await http().post(`/api/v1/enrollments/${u.enrollmentId}/verification/appeal`).set(u.auth).send({ reason: '가채점 결과와 달라요' }).expect(201);
      expect((await prisma.passVerification.findUniqueOrThrow({ where: { id: sub.body.id } })).status).toBe('REVIEWING');
    });

    it('정책 변경은 기존 참여자 보상에 소급되지 않음', async () => {
      await examFuture();
      const before = await enrolled();
      const admin = await signup(app, { role: 'SUPER_ADMIN' });
      await http().post('/api/v1/admin/policy').set(admin.auth).send({ version: '2026-11-v9.0', values: { togetherReward: 5000 } }).expect(201);
      const after = await enrolled();
      const [a, b] = await Promise.all([before, after].map((x) => prisma.enrollment.findUniqueOrThrow({ where: { id: x.enrollmentId } })));
      expect(a.rewardSnapshot).toBe(2000);
      expect(b).toMatchObject({ rewardSnapshot: 5000, policyVersion: '2026-11-v9.0' });
      expect(await prisma.adminAuditLog.count({ where: { action: 'POLICY_PUBLISH', targetId: '2026-11-v9.0' } })).toBe(1);
      // 원복
      await http().post('/api/v1/admin/policy').set(admin.auth).send({ version: '2026-11-v9.1', values: { togetherReward: 2000 } }).expect(201);
    });
  });

  describe('포인트 원장 정합성', () => {
    it('같은 dedupeKey 동시 20회 지급 → 1건만 반영', async () => {
      const u = await signup(app);
      const svc = app.get(PointsService);
      const rs = await Promise.allSettled(Array.from({ length: 20 }, () => prisma.$transaction((tx) => svc.post(tx, { userId: u.id, type: 'EARN', amount: 1000, reason: '테스트', dedupeKey: `test:same:${u.id}` }))));
      expect(rs.filter((r) => r.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
      expect(await prisma.pointLedgerEntry.count({ where: { dedupeKey: `test:same:${u.id}` } })).toBe(1);
      expect((await svc.audit(u.id))).toMatchObject({ cached: 4500, ledger: 4500, consistent: true });
    });

    it('동시 차감 10건(각 1,000P, 잔액 3,500P) → 3건만 성공, 잔액 음수 불가', async () => {
      const u = await signup(app);
      const svc = app.get(PointsService);
      const rs = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => prisma.$transaction((tx) => svc.post(tx, { userId: u.id, type: 'SPEND', amount: -1000, reason: '교환', dedupeKey: `spend:${u.id}:${i}` }))));
      expect(rs.filter((r) => r.status === 'fulfilled').length).toBe(3);
      expect(await svc.audit(u.id)).toMatchObject({ cached: 500, ledger: 500, lastBalanceAfter: 500, consistent: true });
    });

    it('역분개: 1회만 가능, 잔액 복원', async () => {
      const u = await signup(app);
      const svc = app.get(PointsService);
      const welcome = await prisma.pointLedgerEntry.findFirstOrThrow({ where: { userId: u.id } });
      await prisma.$transaction((tx) => svc.reverse(tx, welcome.id, '테스트 취소'));
      const dup = await prisma.$transaction((tx) => svc.reverse(tx, welcome.id, '테스트 취소'));
      expect(dup.duplicate).toBe(true);
      expect(await svc.audit(u.id)).toMatchObject({ cached: 0, ledger: 0, consistent: true });
    });

    it('관리자 수동 조정: SUPER_ADMIN 만, 멱등키로 중복 방지, 감사 로그', async () => {
      const u = await signup(app);
      const op = await signup(app, { role: 'OPERATOR' });
      const admin = await signup(app, { role: 'SUPER_ADMIN' });
      const body = { amount: 1500, reason: 'CS 보상', idempotencyKey: `cs-${u.id}` };
      await http().post(`/api/v1/admin/users/${u.id}/points`).set(op.auth).send(body).expect(403);
      const a = await http().post(`/api/v1/admin/users/${u.id}/points`).set(admin.auth).send(body).expect(201);
      const b = await http().post(`/api/v1/admin/users/${u.id}/points`).set(admin.auth).send(body).expect(201);
      expect(a.body).toMatchObject({ balanceAfter: 5000, duplicate: false });
      expect(b.body.duplicate).toBe(true);
      expect(await prisma.adminAuditLog.count({ where: { action: 'POINT_ADJUST', targetId: u.id } })).toBe(1);
      const me = await http().get('/api/v1/me/points').set(u.auth).expect(200);
      expect(me.body.balance).toBe(5000);
    });
  });
});
