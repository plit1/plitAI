import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, prisma, resetDb, signup } from './helpers';

const DAY = 86400000;

describe('회차 WIN/DRAW/LOSE·순위 (e2e, 데모 규칙)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => { await resetDb(); app = await createApp(); });
  afterAll(async () => { await app.close(); await prisma.$disconnect(); });

  /** 회원 가입·참여 → 10일 전 참여로 조정 → 지난 7일 매일 minutes 분 세션 기록 */
  async function participant(minutes: number, plan: 'FREE' | 'PREMIUM' = 'FREE') {
    const u = await signup(app);
    if (plan === 'PREMIUM') {
      const o = await http().post('/api/v1/payments/orders').set(u.auth).send({ offeringId: 'is-open' }).expect(201);
      await http().post('/api/v1/payments/confirm').set(u.auth).send({ orderNo: o.body.orderNo, paymentKey: `mock_ok_${o.body.orderNo}`, amount: 29000 }).expect(200);
    }
    const j = await http().post('/api/v1/challenges/is-open/join').set(u.auth).send({ plan }).expect(201);
    const enrollmentId = j.body.enrollment.id as string;
    await prisma.enrollment.update({ where: { id: enrollmentId }, data: { joinedAt: new Date(Date.now() - 10 * DAY) } });
    await prisma.studySession.createMany({ data: Array.from({ length: 7 }, (_, i) => ({ userId: u.id, enrollmentId, status: 'COMPLETED' as const, startedAt: new Date(Date.now() - i * DAY - 3600_000), endedAt: new Date(Date.now() - i * DAY), minutes, elapsedSec: minutes * 60 })) });
    await prisma.studyRecord.update({ where: { enrollmentId }, data: { totalMin: minutes * 7 } });
    return { ...u, enrollmentId };
  }

  it('10명 이상: 평균 대비 WIN/LOSE, 플릿런은 순위 비공개·부스터는 상세 순위', async () => {
    for (let i = 0; i < 9; i++) await participant(60);
    const top = await participant(120, 'PREMIUM'); // 평균보다 크게 높음
    const low = await participant(20); // 평균보다 크게 낮음
    const t = await http().get(`/api/v1/enrollments/${top.enrollmentId}/dashboard`).set(top.auth).expect(200);
    expect(t.body.comparison).toMatchObject({ sample: 11, fullSample: 11, wdl: { status: 'WIN' } });
    expect(t.body.comparison.ranks).toMatchObject({ recent7: { rank: 1, of: 11 }, cumulative: { rank: 1 } });
    const l = await http().get(`/api/v1/enrollments/${low.enrollmentId}/dashboard`).set(low.auth).expect(200);
    expect(l.body.comparison.wdl.status).toBe('LOSE');
    expect(l.body.comparison.ranks).toBeNull();
    expect(l.body.comparison.rankNote).toContain('부스터');
    expect(JSON.stringify(l.body)).not.toContain(top.id); // 타인 식별 정보 비노출
  });

  it('테스트 계정은 비교 모집단에서 제외', async () => {
    const before = await participant(60);
    const d0 = await http().get(`/api/v1/enrollments/${before.enrollmentId}/dashboard`).set(before.auth).expect(200);
    await prisma.user.update({ where: { id: before.id }, data: { isTest: true } });
    const other = await participant(60);
    const d1 = await http().get(`/api/v1/enrollments/${other.enrollmentId}/dashboard`).set(other.auth).expect(200);
    expect(d1.body.comparison.sample).toBe(d0.body.comparison.sample); // 1명 추가 − 테스트 계정 1명 제외
  });
});
