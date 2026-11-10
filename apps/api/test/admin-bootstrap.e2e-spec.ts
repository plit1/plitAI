import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createAdmin, parseArgs, tempPassword } from '../src/cli/create-admin';
import { createApp, prisma, resetDb, signup } from './helpers';

describe('최초 관리자 생성·임시 비밀번호 강제 변경 (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => { await resetDb(); app = await createApp(); });
  afterAll(async () => { await app.close(); await prisma.$disconnect(); });

  it('인자 검사·임시 비밀번호 규칙', () => {
    expect(() => parseArgs([])).toThrow('사용법');
    expect(() => parseArgs(['--email', 'x'])).toThrow('사용법');
    expect(() => parseArgs(['--email', 'a@b.kr', '--password', 'x'])).toThrow('알 수 없는 옵션');
    expect(parseArgs(['--email', ' Admin@PLIT.kr '])).toMatchObject({ email: 'admin@plit.kr', allowAdditional: false });
    for (let i = 0; i < 50; i++) { const p = tempPassword(); expect(p).toMatch(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)[A-Za-z0-9]{20}$/); expect(p).not.toMatch(/[0O1lI]/); }
  });

  it('생성 → 임시 비밀번호 로그인 → 변경 전에는 계정 설정 외 403 → 변경 → 모든 세션 종료 → 새 비밀번호 로그인', async () => {
    const { user, password } = await createAdmin(prisma, parseArgs(['--email', 'boss@plit.test', '--nickname', '대표관리자']));
    expect(user).toMatchObject({ role: 'SUPER_ADMIN', passwordChangeRequired: true, emailVerified: true });
    expect(user.passwordHash).not.toContain(password);
    expect(await prisma.adminAuditLog.count({ where: { action: 'ADMIN_BOOTSTRAP', targetId: user.id } })).toBe(1);
    expect(await prisma.pointLedgerEntry.count({ where: { userId: user.id } })).toBe(0); // 관리자 계정엔 가입 축하 포인트 없음

    const login = await http().post('/api/v1/auth/login').send({ email: 'boss@plit.test', password }).expect(200);
    expect(login.body.user.passwordChangeRequired).toBe(true);
    const auth = { Authorization: `Bearer ${login.body.accessToken}` };
    const me = (await http().get('/api/v1/me').set(auth).expect(200)).body;
    expect(me).toMatchObject({ passwordChangeRequired: true, mfaEnabled: false, role: 'SUPER_ADMIN' });
    expect((await http().get('/api/v1/me/enrollments').set(auth).expect(403)).body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await http().get('/api/v1/admin/users').set(auth).expect(403)).body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await http().post('/api/v1/auth/password/change').set(auth).send({ currentPassword: 'wrong123', newPassword: 'NewPass1234' }).expect(401)).body.code).toBe('WRONG_PASSWORD');
    expect((await http().post('/api/v1/auth/password/change').set(auth).send({ currentPassword: password, newPassword: password }).expect(400)).body.code).toBe('SAME_PASSWORD');
    expect((await http().post('/api/v1/auth/password/change').set(auth).send({ currentPassword: password, newPassword: 'boss12345abc' }).expect(400)).body.code).toBe('WEAK_PASSWORD');
    await http().post('/api/v1/auth/password/change').set(auth).send({ currentPassword: password, newPassword: 'short' }).expect(400);
    const cookie = login.headers['set-cookie'] as unknown as string[];
    await http().post('/api/v1/auth/password/change').set(auth).send({ currentPassword: password, newPassword: 'Strong-New-Pass-2026' }).expect(200);
    await http().post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401); // 기존 세션 종료
    await http().post('/api/v1/auth/login').send({ email: 'boss@plit.test', password }).expect(401);
    const again = await http().post('/api/v1/auth/login').send({ email: 'boss@plit.test', password: 'Strong-New-Pass-2026' }).expect(200);
    expect(again.body.user.passwordChangeRequired).toBe(false);
    await http().get('/api/v1/me/enrollments').set({ Authorization: `Bearer ${again.body.accessToken}` }).expect(200);
    expect(await prisma.adminAuditLog.count({ where: { action: 'PASSWORD_CHANGE', actorId: user.id } })).toBe(1);
  });

  it('최고관리자가 이미 있으면 거부(--allow-additional 만 허용), 가입된 이메일 거부, 일반 회원 비밀번호 변경', async () => {
    await expect(createAdmin(prisma, parseArgs(['--email', 'second@plit.test']))).rejects.toThrow('이미 최고관리자가');
    const extra = await createAdmin(prisma, parseArgs(['--email', 'second@plit.test', '--allow-additional']));
    expect(extra.user.role).toBe('SUPER_ADMIN');
    const u = await signup(app);
    await expect(createAdmin(prisma, parseArgs(['--email', u.email, '--allow-additional']))).rejects.toThrow('이미 가입된 이메일');
    await http().post('/api/v1/auth/password/change').set(u.auth).send({ currentPassword: 'abcd1234', newPassword: 'abcd5678x' }).expect(200);
    expect(await prisma.adminAuditLog.count({ where: { action: 'PASSWORD_CHANGE', actorId: u.id } })).toBe(0); // 일반 회원은 감사 로그 대상 아님
  });
});
