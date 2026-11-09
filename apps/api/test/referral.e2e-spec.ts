import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PolicyService } from '../src/modules/policy/policy.service';
import { createApp, prisma, resetDb, signup } from './helpers';

/** 특정 IP 에서 가입 (trust proxy 1 → X-Forwarded-For) */
let seq = 0;
async function signupFrom(app: INestApplication, ip: string, referralCode?: string) {
  const email = `ref${Date.now()}${seq++}@test.plit`;
  const res = await request(app.getHttpServer()).post('/api/v1/auth/signup').set('X-Forwarded-For', ip)
    .send({ email, password: 'abcd1234', nickname: `친구${seq}`, consents: ['TERMS', 'PRIVACY', 'AGE_14'], referralCode }).expect(201);
  return { id: res.body.user.id as string, auth: { Authorization: `Bearer ${res.body.accessToken}` } };
}

describe('친구 초대 (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  let op: Awaited<ReturnType<typeof signup>>;
  async function joinAndStudy(auth: Record<string, string>) {
    await http().post('/api/v1/challenges/is-open/join').set(auth).send({ plan: 'FREE' }).expect(201);
    const enr = (await http().get('/api/v1/me/enrollments').set(auth).expect(200)).body[0];
    const s = await http().post(`/api/v1/enrollments/${enr.id}/sessions`).set(auth).expect(201);
    await prisma.studySession.update({ where: { id: s.body.id }, data: { resumedAt: new Date(Date.now() - 2 * 60000) } });
    await http().post(`/api/v1/sessions/${s.body.id}/complete`).set(auth).expect(200);
  }
  const balance = async (userId: string) => (await prisma.pointAccount.findUnique({ where: { userId } }))?.balance ?? 0;
  beforeAll(async () => { await resetDb(); app = await createApp(); op = await signup(app, { role: 'OPERATOR' }); });
  afterAll(async () => { await app.close(); await prisma.$disconnect(); });

  it('초대 링크 랜딩: 유효 코드는 마스킹된 닉네임, 잘못된 코드는 invalid', async () => {
    const a = await signupFrom(app, '10.0.0.1');
    const code = (await prisma.user.findUniqueOrThrow({ where: { id: a.id } })).referralCode;
    const l = (await http().get(`/api/v1/referral/${code.toLowerCase()}`).expect(200)).body;
    expect(l).toMatchObject({ valid: true, code, welcomePoints: 3500 });
    expect(l.inviter).toMatch(/^친\*+$/);
    expect((await http().get('/api/v1/referral/NOPE1234').expect(200)).body).toEqual({ valid: false });
  });

  it('가입만으로는 보상 없음 → 첫 참여·1분 이상 학습 → 승인 대기 → 승인 시 추천인 +1,000P·알림·감사, 재승인 409', async () => {
    const a = await signupFrom(app, '10.0.1.1');
    await joinAndStudy(a.auth);
    const code = (await prisma.user.findUniqueOrThrow({ where: { id: a.id } })).referralCode;
    let me = (await http().get('/api/v1/me/referral').set(a.auth).expect(200)).body;
    expect(me).toMatchObject({ code, eligible: true, stats: { invited: 0 } });
    expect(me.link).toContain(`/invite/${code}`);

    const b = await signupFrom(app, '10.0.1.2', code);
    expect(await prisma.referralReward.count({ where: { refereeId: b.id } })).toBe(0);
    me = (await http().get('/api/v1/me/referral').set(a.auth).expect(200)).body;
    expect(me.friends[0]).toMatchObject({ step: 'SIGNED_UP' });
    expect(me.friends[0].alias).toMatch(/^user_••/);
    await joinAndStudy(b.auth);
    const rw = await prisma.referralReward.findFirstOrThrow({ where: { refereeId: b.id } });
    expect(rw).toMatchObject({ status: 'PENDING', amount: 1000, referrerId: a.id });

    const before = await balance(a.id);
    const user = await signup(app);
    await http().post(`/api/v1/admin/referral/rewards/${rw.id}/approve`).set(user.auth).send({}).expect(403);
    const ok = await http().post(`/api/v1/admin/referral/rewards/${rw.id}/approve`).set(op.auth).send({}).expect(201);
    expect(ok.body.status).toBe('REWARDED');
    expect(await balance(a.id)).toBe(before + 1000);
    await http().post(`/api/v1/admin/referral/rewards/${rw.id}/approve`).set(op.auth).send({}).expect(409);
    expect(await prisma.pointLedgerEntry.count({ where: { dedupeKey: `referral:${b.id}:REFERRAL_FIRST_STUDY` } })).toBe(1);
    const n = (await http().get('/api/v1/me/notifications').set(a.auth).expect(200)).body;
    expect(n.items[0]).toMatchObject({ type: 'REFERRAL_REWARDED', readAt: null });
    expect(await prisma.adminAuditLog.count({ where: { action: 'REFERRAL_APPROVE', targetId: rw.id } })).toBe(1);
    me = (await http().get('/api/v1/me/referral').set(a.auth).expect(200)).body;
    expect(me.friends[0].step).toBe('REWARDED');
    expect(me.month).toMatchObject({ count: 1, points: 1000 });
  });

  it('중복 계정 의심(추천인과 같은 접속 환경): 그냥 승인 409, 확인 내용 없이 해제 400, 확인 후 해제 승인', async () => {
    const a = await signupFrom(app, '10.0.2.1');
    await joinAndStudy(a.auth);
    const code = (await prisma.user.findUniqueOrThrow({ where: { id: a.id } })).referralCode;
    const c = await signupFrom(app, '10.0.2.1', code); // 추천인 로그인 IP 와 동일
    expect(await prisma.referralAttribution.findUniqueOrThrow({ where: { refereeId: c.id } })).toMatchObject({ dupSuspect: true });
    const ip = await prisma.referralAttribution.findUniqueOrThrow({ where: { refereeId: c.id } });
    expect(ip.ipHash).not.toContain('10.0.2.1'); // 원문 IP 저장 안 함
    await joinAndStudy(c.auth);
    const rw = await prisma.referralReward.findFirstOrThrow({ where: { refereeId: c.id } });
    expect((await http().post(`/api/v1/admin/referral/rewards/${rw.id}/approve`).set(op.auth).send({}).expect(409)).body.code).toBe('DUP_SUSPECT');
    expect((await http().post(`/api/v1/admin/referral/rewards/${rw.id}/approve`).set(op.auth).send({ overrideDup: true }).expect(400)).body.code).toBe('NOTE_REQUIRED');
    const ok = await http().post(`/api/v1/admin/referral/rewards/${rw.id}/approve`).set(op.auth).send({ overrideDup: true, note: '가족 확인 (고객센터 통화)' }).expect(201);
    expect(ok.body.status).toBe('REWARDED');
    // 같은 추천인의 다른 초대 가입과 같은 IP → 의심
    const d = await signupFrom(app, '10.0.2.9', code);
    const e = await signupFrom(app, '10.0.2.9', code);
    expect((await prisma.referralAttribution.findUniqueOrThrow({ where: { refereeId: d.id } })).dupSuspect).toBe(false);
    expect((await prisma.referralAttribution.findUniqueOrThrow({ where: { refereeId: e.id } })).dupReason).toContain('다른 초대 가입');
  });

  it('재검증 실패는 자동 거절: 첫 참여 취소, 월 한도 초과 / 수동 거절은 사유 필수', async () => {
    const a = await signupFrom(app, '10.0.3.1');
    await joinAndStudy(a.auth);
    const code = (await prisma.user.findUniqueOrThrow({ where: { id: a.id } })).referralCode;
    const b = await signupFrom(app, '10.0.3.2', code);
    await joinAndStudy(b.auth);
    const rb = await prisma.referralReward.findFirstOrThrow({ where: { refereeId: b.id } });
    await prisma.enrollment.update({ where: { id: rb.enrollmentId }, data: { status: 'CANCELLED' } });
    const r1 = (await http().post(`/api/v1/admin/referral/rewards/${rb.id}/approve`).set(op.auth).send({}).expect(201)).body;
    expect(r1.status).toBe('REJECTED');
    expect(r1.reason).toContain('첫 챌린지 참여 유지');

    // 정상 1건 지급 → 월 한도 1건으로 정책 발행 → 다음 건은 한도 초과로 자동 거절
    const c = await signupFrom(app, '10.0.3.3', code);
    await joinAndStudy(c.auth);
    const rc = await prisma.referralReward.findFirstOrThrow({ where: { refereeId: c.id } });
    expect((await http().post(`/api/v1/admin/referral/rewards/${rc.id}/approve`).set(op.auth).send({}).expect(201)).body.status).toBe('REWARDED');
    const policy = app.get(PolicyService);
    const original = (await policy.current()).values.referralMonthlyCount;
    await prisma.$transaction((tx) => policy.publish(tx, `test-ref-limit-${Date.now()}`, { referralMonthlyCount: 1 }, op.id));
    try {
      const d = await signupFrom(app, '10.0.3.4', code);
      await joinAndStudy(d.auth);
      const rd = await prisma.referralReward.findFirstOrThrow({ where: { refereeId: d.id } });
      const r2 = (await http().post(`/api/v1/admin/referral/rewards/${rd.id}/approve`).set(op.auth).send({}).expect(201)).body;
      expect(r2.status).toBe('REJECTED');
      expect(r2.reason).toContain('추천인 월 한도');
      const e = await signupFrom(app, '10.0.3.5', code);
      await joinAndStudy(e.auth);
      const re = await prisma.referralReward.findFirstOrThrow({ where: { refereeId: e.id } });
      await http().post(`/api/v1/admin/referral/rewards/${re.id}/reject`).set(op.auth).send({}).expect(400);
      await http().post(`/api/v1/admin/referral/rewards/${re.id}/reject`).set(op.auth).send({ reason: '부정 참여 확인' }).expect(201);
      await http().post(`/api/v1/admin/referral/rewards/${re.id}/approve`).set(op.auth).send({}).expect(409);
    } finally {
      await prisma.$transaction((tx) => policy.publish(tx, `test-ref-restore-${Date.now()}`, { referralMonthlyCount: original }, op.id));
    }
  });

  it('초대받지 않은 회원의 학습은 보상 없음, 정지된 추천인 코드는 귀속 안 됨', async () => {
    const x = await signupFrom(app, '10.0.4.1');
    await joinAndStudy(x.auth);
    expect(await prisma.referralReward.count({ where: { refereeId: x.id } })).toBe(0);
    const banned = await signupFrom(app, '10.0.4.2');
    await prisma.user.update({ where: { id: banned.id }, data: { status: 'SUSPENDED' } });
    const code = (await prisma.user.findUniqueOrThrow({ where: { id: banned.id } })).referralCode;
    const y = await signupFrom(app, '10.0.4.3', code);
    expect(await prisma.referralAttribution.count({ where: { refereeId: y.id } })).toBe(0);
  });

  it('알림센터: 미읽음 수 → 하나 읽음 → 모두 읽음, 남의 알림 404', async () => {
    const u = await signup(app); const other = await signup(app);
    await prisma.notification.createMany({ data: [1, 2, 3].map((i) => ({ userId: u.id, type: 'TEST', title: `t${i}`, body: 'b', dedupeKey: `t:${u.id}:${i}` })) });
    expect((await http().get('/api/v1/me/notifications/unread').set(u.auth).expect(200)).body.unread).toBe(3);
    const list = (await http().get('/api/v1/me/notifications').set(u.auth).expect(200)).body;
    await http().put(`/api/v1/me/notifications/${list.items[0].id}/read`).set(other.auth).expect(404);
    expect((await http().put(`/api/v1/me/notifications/${list.items[0].id}/read`).set(u.auth).expect(200)).body.unread).toBe(2);
    expect((await http().post('/api/v1/me/notifications/read-all').set(u.auth).expect(201)).body.unread).toBe(0);
  });
});
