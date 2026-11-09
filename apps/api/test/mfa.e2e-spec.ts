import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { hotp, currentStep } from '../src/common/totp';

// 이 파일은 관리자 MFA 강제(운영 기본값)를 켠 상태로 앱을 띄운다
process.env.ADMIN_MFA_REQUIRED = 'true';

describe('관리자 2단계 인증 (MFA) (e2e)', () => {
  let app: INestApplication;
  let h: typeof import('./helpers');
  const http = () => request(app.getHttpServer());
  const codeAt = (secret: string, offset = 0) => hotp(secret, currentStep() + offset);

  beforeAll(async () => { h = await import('./helpers'); await h.resetDb(); app = await h.createApp(); });
  afterAll(async () => { delete process.env.ADMIN_MFA_REQUIRED; await app.close(); await h.prisma.$disconnect(); });

  async function enrolledAdmin() {
    const a = await h.signup(app, { role: 'OPERATOR' });
    const e = await http().post('/api/v1/auth/mfa/enroll').set(a.auth).expect(201);
    expect(e.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\/PLIT/);
    await http().post('/api/v1/auth/mfa/confirm').set(a.auth).send({ code: codeAt(e.body.secret) }).expect(200);
    return { ...a, secret: e.body.secret as string };
  }

  it('MFA 없이 로그인한 관리자는 관리자 API 403 MFA_REQUIRED (일반 API 는 정상)', async () => {
    const a = await h.signup(app, { role: 'OPERATOR' });
    const r = await http().get('/api/v1/admin/stats').set(a.auth).expect(403);
    expect(r.body.code).toBe('MFA_REQUIRED');
    await http().get('/api/v1/me').set(a.auth).expect(200);
  });

  it('등록 → 비밀번호 로그인은 단계 토큰만 → OTP 로그인 후 관리자 API 허용, refresh 후에도 유지', async () => {
    const a = await enrolledAdmin();
    const stored = await h.prisma.user.findUniqueOrThrow({ where: { id: a.id } });
    expect(stored.mfaSecret).not.toContain(a.secret); // 암호화 저장

    const step1 = await http().post('/api/v1/auth/login').send({ email: a.email, password: 'abcd1234' }).expect(200);
    expect(step1.body).toMatchObject({ mfaRequired: true });
    expect(step1.body.accessToken).toBeUndefined();
    expect(step1.headers['set-cookie']).toBeUndefined();
    // 단계 토큰은 access 토큰으로 쓸 수 없음
    await http().get('/api/v1/me').set('Authorization', `Bearer ${step1.body.mfaToken}`).expect(401);

    await http().post('/api/v1/auth/login/mfa').send({ mfaToken: step1.body.mfaToken, code: '000000' }).expect(401);
    const step2 = await http().post('/api/v1/auth/login/mfa').send({ mfaToken: step1.body.mfaToken, code: codeAt(a.secret, 1) }).expect(200);
    await http().get('/api/v1/admin/stats').set('Authorization', `Bearer ${step2.body.accessToken}`).expect(200);

    const cookie = step2.headers['set-cookie'] as unknown as string[];
    const r = await http().post('/api/v1/auth/refresh').set('Cookie', cookie).expect(200);
    await http().get('/api/v1/admin/stats').set('Authorization', `Bearer ${r.body.accessToken}`).expect(200);
  });

  it('같은 OTP 코드 재사용 불가 (리플레이 차단)', async () => {
    const a = await enrolledAdmin(); // confirm 에서 현재 단계 사용됨
    const s = await http().post('/api/v1/auth/login').send({ email: a.email, password: 'abcd1234' }).expect(200);
    const r = await http().post('/api/v1/auth/login/mfa').send({ mfaToken: s.body.mfaToken, code: codeAt(a.secret) }).expect(401);
    expect(r.body.code).toBe('MFA_CODE_REUSED');
  });

  it('OAuth state 등 다른 용도 JWT 를 Bearer 로 보내면 401 (500 아님)', async () => {
    const jwt = app.get((await import('@nestjs/jwt')).JwtService);
    const state = await jwt.signAsync({ p: 'KAKAO', consents: [], redirect: '/', n: 'x' });
    await http().get('/api/v1/me').set('Authorization', `Bearer ${state}`).expect(401);
  });

  it('MFA 해제는 코드 필요 + 모든 세션 폐기 / 최고관리자 초기화는 감사 로그', async () => {
    const a = await enrolledAdmin();
    await http().post('/api/v1/auth/mfa/disable').set(a.auth).send({ code: '123456' }).expect(401);
    await http().post('/api/v1/auth/mfa/disable').set(a.auth).send({ code: codeAt(a.secret, 1) }).expect(200);
    await http().post('/api/v1/auth/refresh').set('Cookie', a.cookie).expect(401);

    const b = await enrolledAdmin();
    const sa = await h.signup(app, { role: 'SUPER_ADMIN' });
    const e = await http().post('/api/v1/auth/mfa/enroll').set(sa.auth).expect(201);
    await http().post('/api/v1/auth/mfa/confirm').set(sa.auth).send({ code: codeAt(e.body.secret) }).expect(200);
    const s1 = await http().post('/api/v1/auth/login').send({ email: sa.email, password: 'abcd1234' }).expect(200);
    const s2 = await http().post('/api/v1/auth/login/mfa').send({ mfaToken: s1.body.mfaToken, code: codeAt(e.body.secret, 1) }).expect(200);
    const auth = { Authorization: `Bearer ${s2.body.accessToken}` };
    await http().post(`/api/v1/admin/users/${sa.id}/mfa/reset`).set(auth).send({ reason: '본인' }).expect(400);
    await http().post(`/api/v1/admin/users/${b.id}/mfa/reset`).set(auth).send({ reason: 'OTP 기기 분실' }).expect(201);
    expect((await h.prisma.user.findUniqueOrThrow({ where: { id: b.id } })).mfaEnabledAt).toBeNull();
    expect(await h.prisma.adminAuditLog.count({ where: { action: 'USER_MFA_RESET', targetId: b.id } })).toBe(1);
  });
});
