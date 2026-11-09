import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MailService } from '../src/modules/auth/mail.service';
import { createApp, prisma, resetDb, signup } from './helpers';

describe('MODULE 01 회원·인증 (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => { await resetDb(); app = await createApp(); });
  afterAll(async () => { await app.close(); await prisma.$disconnect(); });

  it('필수 동의 없으면 가입 거절', async () => {
    const r = await http().post('/api/v1/auth/signup').send({ email: 'a@test.plit', password: 'abcd1234', nickname: '플릿', consents: ['TERMS'] }).expect(400);
    expect(r.body.code).toBe('CONSENT_REQUIRED');
  });

  it('약한 비밀번호·잘못된 이메일 → VALIDATION', async () => {
    const r = await http().post('/api/v1/auth/signup').send({ email: 'nope', password: '123', nickname: '플릿', consents: ['TERMS', 'PRIVACY', 'AGE_14'] }).expect(400);
    expect(r.body.code).toBe('VALIDATION');
  });

  it('가입 → 가입축하 3,500P 원장 기록 + 동의 이력 + httpOnly refresh 쿠키', async () => {
    const u = await signup(app);
    expect(u.cookie.join(';')).toMatch(/plit_rt=.*HttpOnly/i);
    const me = await http().get('/api/v1/me').set(u.auth).expect(200);
    expect(me.body.points).toBe(3500);
    const ledger = await prisma.pointLedgerEntry.findMany({ where: { userId: u.id } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ type: 'EARN', amount: 3500, isVirtual: true, dedupeKey: `welcome:${u.id}` });
    const consents = await http().get('/api/v1/me/consents').set(u.auth).expect(200);
    expect(consents.body.find((c: any) => c.type === 'MARKETING').agreed).toBe(false);
  });

  it('중복 이메일 가입 409', async () => {
    const u = await signup(app);
    const r = await http().post('/api/v1/auth/signup').send({ email: u.email.toUpperCase(), password: 'abcd1234', nickname: '중복', consents: ['TERMS', 'PRIVACY', 'AGE_14'] }).expect(409);
    expect(r.body.code).toBe('EMAIL_TAKEN');
  });

  it('로그인 실패 메시지는 계정 존재 여부를 드러내지 않음', async () => {
    const u = await signup(app);
    const a = await http().post('/api/v1/auth/login').send({ email: u.email, password: 'wrong1234' }).expect(401);
    const b = await http().post('/api/v1/auth/login').send({ email: 'none@test.plit', password: 'wrong1234' }).expect(401);
    expect(a.body.message).toBe(b.body.message);
    await http().post('/api/v1/auth/login').send({ email: u.email, password: 'abcd1234' }).expect(200);
  });

  it('refresh 토큰 회전 + 재사용 탐지 시 family 전체 폐기', async () => {
    const u = await signup(app);
    const r1 = await http().post('/api/v1/auth/refresh').set('Cookie', u.cookie).expect(200);
    expect(r1.body.accessToken).toBeTruthy();
    const newCookie = r1.headers['set-cookie'] as unknown as string[];
    // 이전 토큰 재사용 → 거절 + 새 토큰까지 폐기
    await http().post('/api/v1/auth/refresh').set('Cookie', u.cookie).expect(401);
    await http().post('/api/v1/auth/refresh').set('Cookie', newCookie).expect(401);
  });

  it('로그아웃 후 refresh 불가', async () => {
    const u = await signup(app);
    await http().post('/api/v1/auth/logout').set('Cookie', u.cookie).expect(204);
    await http().post('/api/v1/auth/refresh').set('Cookie', u.cookie).expect(401);
  });

  it('비밀번호 재설정: 토큰 1회용, 기존 세션 폐기', async () => {
    const u = await signup(app);
    await http().post('/api/v1/auth/password-reset/request').send({ email: u.email }).expect(202);
    await http().post('/api/v1/auth/password-reset/request').send({ email: 'ghost@test.plit' }).expect(202); // 동일 응답
    const mail = app.get(MailService).outbox.find((m) => m.to === u.email)!;
    const token = mail.body.match(/token=([\w-]+)/)![1];
    await http().post('/api/v1/auth/password-reset/confirm').send({ token, password: 'newpass123' }).expect(204);
    await http().post('/api/v1/auth/password-reset/confirm').send({ token, password: 'again12345' }).expect(400);
    await http().post('/api/v1/auth/refresh').set('Cookie', u.cookie).expect(401);
    await http().post('/api/v1/auth/login').send({ email: u.email, password: 'newpass123' }).expect(200);
  });

  it('인증 없이 보호 API 401 / 위조 토큰 401', async () => {
    await http().get('/api/v1/me').expect(401);
    await http().get('/api/v1/me').set('Authorization', 'Bearer abc.def.ghi').expect(401);
  });

  it('정지 회원은 기존 access 토큰으로도 접근 불가', async () => {
    const u = await signup(app);
    await prisma.user.update({ where: { id: u.id }, data: { status: 'SUSPENDED' } });
    const r = await http().get('/api/v1/me').set(u.auth).expect(403);
    expect(r.body.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('회원 탈퇴: 개인정보 익명화, 원장 보존, 재로그인 불가', async () => {
    const u = await signup(app);
    await http().delete('/api/v1/me').set(u.auth).send({ confirm: '아니요' }).expect(400);
    await http().delete('/api/v1/me').set(u.auth).send({ confirm: '탈퇴합니다' }).expect(204);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row).toMatchObject({ status: 'WITHDRAWN', email: null, passwordHash: null, nickname: '탈퇴회원' });
    expect(await prisma.pointLedgerEntry.count({ where: { userId: u.id } })).toBe(1);
    await http().get('/api/v1/me').set(u.auth).expect(401);
    await http().post('/api/v1/auth/login').send({ email: u.email, password: 'abcd1234' }).expect(401);
  });

  it('소셜 로그인: 앱 키 미설정 provider 는 503 안내', async () => {
    const r = await http().get('/api/v1/auth/oauth/kakao/start?consents=TERMS,PRIVACY,AGE_14').expect(503);
    expect(r.body.code).toBe('PROVIDER_NOT_CONFIGURED');
    await http().get('/api/v1/auth/oauth/facebook/start').expect(404);
  });
});

describe('요청 제한 (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => { process.env.THROTTLE_STRICT = '1'; app = await createApp(); });
  afterAll(async () => { delete process.env.THROTTLE_STRICT; await app.close(); });
  it('로그인 1분 10회 초과 시 429', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: 'x@test.plit', password: 'abcd1234' })).status);
    expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
    expect(codes.slice(10)).toEqual([429, 429]);
  });
});
