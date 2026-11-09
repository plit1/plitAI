import { INestApplication } from '@nestjs/common';
import request from 'supertest';

// 카카오·구글 앱 키가 설정된 상황을 재현 (실제 provider 대신 가짜 HTTP 응답)
process.env.KAKAO_CLIENT_ID = 'test-kakao';
process.env.GOOGLE_CLIENT_ID = 'test-google';
process.env.GOOGLE_CLIENT_SECRET = 'test-secret';

describe('소셜 로그인·계정 연결 (e2e, 가짜 provider)', () => {
  let app: INestApplication;
  let h: typeof import('./helpers');
  const http = () => request(app.getHttpServer());
  /** code → provider 프로필 매핑 */
  const profiles = new Map<string, any>();

  beforeAll(async () => {
    h = await import('./helpers');
    await h.resetDb();
    app = await h.createApp();
    const { OAuthService } = await import('../src/modules/auth/oauth.service');
    app.get(OAuthService).http = async (url, init) => {
      if (url.includes('/token')) {
        const code = new URLSearchParams(String(init?.body)).get('code')!;
        return { ok: profiles.has(code), status: profiles.has(code) ? 200 : 400, json: async () => (profiles.has(code) ? { access_token: `at-${code}` } : { error: 'invalid_grant' }) };
      }
      const code = String((init?.headers as any).Authorization).replace('Bearer at-', '');
      return { ok: true, status: 200, json: async () => profiles.get(code) };
    };
  });
  afterAll(async () => { await app.close(); await h.prisma.$disconnect(); });

  async function start(path: string, auth?: Record<string, string>) {
    if (auth) {
      const r = await http().post(path).set(auth).expect(201);
      return new URL(r.body.url).searchParams.get('state')!;
    }
    const r = await http().get(path).expect(302);
    const url = new URL(r.headers.location);
    expect(url.searchParams.get('redirect_uri')).toMatch(/\/auth\/oauth\/(kakao|google)\/callback$/);
    return url.searchParams.get('state')!;
  }

  it('활성 provider 목록', async () => {
    const r = await http().get('/api/v1/auth/providers').expect(200);
    expect(r.body.social.sort()).toEqual(['GOOGLE', 'KAKAO']);
  });

  it('카카오 신규 가입 → refresh 쿠키 + 앱으로 리다이렉트, 재로그인은 같은 계정', async () => {
    profiles.set('k1', { id: 9001, kakao_account: { is_email_verified: true, email: 'kakao1@test.plit', profile: { nickname: '카카오유저' } } });
    const state = await start('/api/v1/auth/oauth/kakao/start?consents=TERMS,PRIVACY,AGE_14&redirect=/finder');
    const cb = await http().get(`/api/v1/auth/oauth/kakao/callback?code=k1&state=${encodeURIComponent(state)}`).expect(302);
    expect(cb.headers.location).toBe('http://localhost:3000/auth/callback?next=%2Ffinder');
    expect(String(cb.headers['set-cookie'])).toMatch(/plit_rt=/);
    const u = await h.prisma.user.findUniqueOrThrow({ where: { email: 'kakao1@test.plit' }, include: { identities: true } });
    expect(u.identities.map((i) => i.provider)).toEqual(['KAKAO']);
    expect(await h.prisma.pointLedgerEntry.count({ where: { userId: u.id } })).toBe(1); // 가입 축하

    const state2 = await start('/api/v1/auth/oauth/kakao/start?consents=TERMS,PRIVACY,AGE_14');
    await http().get(`/api/v1/auth/oauth/kakao/callback?code=k1&state=${encodeURIComponent(state2)}`).expect(302);
    expect(await h.prisma.user.count({ where: { email: 'kakao1@test.plit' } })).toBe(1);
  });

  it('필수 동의 없는 소셜 신규 가입 → 로그인 화면 오류', async () => {
    profiles.set('k2', { id: 9002, kakao_account: {} });
    const state = await start('/api/v1/auth/oauth/kakao/start');
    const cb = await http().get(`/api/v1/auth/oauth/kakao/callback?code=k2&state=${encodeURIComponent(state)}`).expect(302);
    expect(cb.headers.location).toContain('/login?error=CONSENT_REQUIRED');
  });

  it('같은 이메일의 기존 계정이 있으면 자동 병합하지 않음', async () => {
    const existing = await h.signup(app);
    profiles.set('g1', { sub: 'g-1', email_verified: true, email: existing.email, name: 'G' });
    const state = await start('/api/v1/auth/oauth/google/start?consents=TERMS,PRIVACY,AGE_14');
    const cb = await http().get(`/api/v1/auth/oauth/google/callback?code=g1&state=${encodeURIComponent(state)}`).expect(302);
    expect(cb.headers.location).toContain('error=EMAIL_LINK_REQUIRED');
    expect(await h.prisma.authIdentity.count({ where: { provider: 'GOOGLE' } })).toBe(0);
  });

  it('위조·만료 state, 다른 provider state 거절', async () => {
    const state = await start('/api/v1/auth/oauth/kakao/start?consents=TERMS,PRIVACY,AGE_14');
    const cross = await http().get(`/api/v1/auth/oauth/google/callback?code=x&state=${encodeURIComponent(state)}`).expect(302);
    expect(cross.headers.location).toContain('error=INVALID_OAUTH_STATE');
    const forged = await http().get('/api/v1/auth/oauth/kakao/callback?code=x&state=abc').expect(302);
    expect(forged.headers.location).toContain('error=INVALID_OAUTH_STATE');
  });

  it('로그인 상태에서 구글 연결 → 목록 → 해제 (마지막 수단·이메일은 해제 불가)', async () => {
    const u = await h.signup(app);
    profiles.set('g2', { sub: 'g-2', email_verified: true, email: 'other@test.plit' });
    const state = await start('/api/v1/me/identities/google/link', u.auth);
    const cb = await http().get(`/api/v1/auth/oauth/google/callback?code=g2&state=${encodeURIComponent(state)}`).expect(302);
    expect(cb.headers.location).toBe('http://localhost:3000/my/account?linked=GOOGLE');
    const list = await http().get('/api/v1/me/identities').set(u.auth).expect(200);
    expect(list.body.map((i: any) => i.provider)).toEqual(['EMAIL', 'GOOGLE']);

    // 다른 회원이 같은 구글 계정 연결 시도 → 거절
    const v = await h.signup(app);
    const s2 = await start('/api/v1/me/identities/google/link', v.auth);
    const cb2 = await http().get(`/api/v1/auth/oauth/google/callback?code=g2&state=${encodeURIComponent(s2)}`).expect(302);
    expect(cb2.headers.location).toContain('error=IDENTITY_IN_USE');

    await http().delete('/api/v1/me/identities/email').set(u.auth).expect(400);
    await http().delete('/api/v1/me/identities/google').set(u.auth).expect(204);
    expect(await h.prisma.authIdentity.count({ where: { userId: u.id } })).toBe(1);
  });

  it('소셜 단독 회원은 마지막 로그인 수단 해제 불가', async () => {
    profiles.set('k3', { id: 9003, kakao_account: {} });
    const state = await start('/api/v1/auth/oauth/kakao/start?consents=TERMS,PRIVACY,AGE_14');
    const cb = await http().get(`/api/v1/auth/oauth/kakao/callback?code=k3&state=${encodeURIComponent(state)}`).expect(302);
    const cookie = cb.headers['set-cookie'] as unknown as string[];
    const r = await http().post('/api/v1/auth/refresh').set('Cookie', cookie).expect(200);
    const res = await http().delete('/api/v1/me/identities/kakao').set('Authorization', `Bearer ${r.body.accessToken}`).expect(400);
    expect(res.body.code).toBe('LAST_LOGIN_METHOD');
  });
});
