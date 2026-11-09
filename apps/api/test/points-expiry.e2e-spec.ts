import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PointsService } from '../src/modules/points/points.service';
import { createApp, prisma, resetDb, signup } from './helpers';

const DAY = 86400000;

describe('포인트 만료 (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => { await resetDb(); app = await createApp(); });
  afterAll(async () => { await app.close(); await prisma.$disconnect(); });

  it('적립 시 정책 유효기간(365일) 자동 설정', async () => {
    const u = await signup(app);
    const welcome = await prisma.pointLedgerEntry.findFirstOrThrow({ where: { userId: u.id } });
    const days = Math.round((welcome.expiresAt!.getTime() - welcome.createdAt.getTime()) / DAY);
    expect(days).toBe(365);
  });

  it('일부 사용 후 만료: 남은 금액만 EXPIRE, 잔액·원장 정합성 유지, 재실행 무변경', async () => {
    const u = await signup(app);
    const svc = app.get(PointsService);
    await prisma.$transaction((tx) => svc.post(tx, { userId: u.id, type: 'SPEND', amount: -1000, reason: '교환', dedupeKey: `spend-exp:${u.id}` }));
    // 가입 축하 포인트(3,500P)의 만료일을 과거로
    await prisma.pointLedgerEntry.updateMany({ where: { userId: u.id, dedupeKey: `welcome:${u.id}` }, data: { expiresAt: new Date(Date.now() - DAY) } });
    const soon = await http().get('/api/v1/me/points/expiring').set(u.auth).expect(200);
    expect(soon.body.total).toBe(0); // 이미 지난 것은 "예정"이 아님
    const r = await svc.expireDue();
    expect(r.entries).toBeGreaterThanOrEqual(1);
    const exp = await prisma.pointLedgerEntry.findFirstOrThrow({ where: { userId: u.id, type: 'EXPIRE' } });
    expect(exp).toMatchObject({ amount: -2500, refType: 'POINT_ENTRY' });
    expect(await svc.audit(u.id)).toMatchObject({ cached: 0, ledger: 0, consistent: true });
    await svc.expireDue();
    expect(await prisma.pointLedgerEntry.count({ where: { userId: u.id, type: 'EXPIRE' } })).toBe(1);
  });

  it('동시 만료 배치 3개 → 로트당 1건만', async () => {
    const u = await signup(app);
    await prisma.pointLedgerEntry.updateMany({ where: { userId: u.id }, data: { expiresAt: new Date(Date.now() - DAY) } });
    const svc = app.get(PointsService);
    await Promise.all([svc.expireDue(), svc.expireDue(), svc.expireDue()]);
    expect(await prisma.pointLedgerEntry.count({ where: { userId: u.id, type: 'EXPIRE' } })).toBe(1);
    expect((await svc.audit(u.id)).cached).toBe(0);
  });

  it('30일 안 만료 예정 조회, 관리자 수동 실행(SUPER_ADMIN 전용)', async () => {
    const u = await signup(app);
    await prisma.pointLedgerEntry.updateMany({ where: { userId: u.id }, data: { expiresAt: new Date(Date.now() + 10 * DAY) } });
    const soon = await http().get('/api/v1/me/points/expiring').set(u.auth).expect(200);
    expect(soon.body).toMatchObject({ withinDays: 30, total: 3500 });
    const op = await signup(app, { role: 'OPERATOR' });
    const sa = await signup(app, { role: 'SUPER_ADMIN' });
    await http().post('/api/v1/admin/points/expire').set(op.auth).expect(403);
    await http().post('/api/v1/admin/points/expire').set(sa.auth).expect(200);
  });

  it('정책 0일이면 만료 없음', async () => {
    const sa = await signup(app, { role: 'SUPER_ADMIN' });
    await http().post('/api/v1/admin/policy').set(sa.auth).send({ version: '2026-11-v8.0', values: { pointExpiryDays: 0 } }).expect(201);
    const u = await signup(app);
    expect((await prisma.pointLedgerEntry.findFirstOrThrow({ where: { userId: u.id } })).expiresAt).toBeNull();
    await http().post('/api/v1/admin/policy').set(sa.auth).send({ version: '2026-11-v8.1', values: { pointExpiryDays: 365 } }).expect(201);
  });
});

describe('정책 값 검증', () => {
  let app: INestApplication;
  beforeAll(async () => { app = await createApp(); });
  afterAll(async () => { await app.close(); });
  it('모든 숫자 항목은 0 이상 정수, 알 수 없는 항목 거절', async () => {
    const sa = await signup(app, { role: 'SUPER_ADMIN' });
    const send = (values: Record<string, unknown>, version: string) => request(app.getHttpServer()).post('/api/v1/admin/policy').set(sa.auth).send({ version, values });
    expect((await send({ pointExpiryDays: -1 }, '2026-11-v7.1').expect(400)).body.code).toBe('INVALID_POLICY');
    expect((await send({ openRunTarget: 1.5 }, '2026-11-v7.2').expect(400)).body.code).toBe('INVALID_POLICY');
    expect((await send({ retryEnabled: 'yes' }, '2026-11-v7.3').expect(400)).body.code).toBe('INVALID_POLICY');
    expect((await send({ hacked: 1 }, '2026-11-v7.4').expect(400)).body.code).toBe('INVALID_POLICY');
  });
});
