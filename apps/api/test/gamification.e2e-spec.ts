import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { XpService } from '../src/modules/gamification/xp.service';
import { createApp, prisma, resetDb, signup } from './helpers';

const DAY = 86400000;

describe('메이트·XP·배지·주간 보상 (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => { await resetDb(); app = await createApp(); });
  afterAll(async () => { await app.close(); await prisma.$disconnect(); });
  const give = (userId: string, events: Parameters<XpService['award']>[2]) => prisma.$transaction((tx) => app.get(XpService).award(tx, userId, events));

  it('입양: 종류·이름 검증, 1인 1마리', async () => {
    const u = await signup(app);
    expect((await http().get('/api/v1/me/mate').set(u.auth).expect(200)).body).toMatchObject({ adopted: false, level: 1, xp: 0, title: '아기 메이트' });
    expect((await http().post('/api/v1/me/mate').set(u.auth).send({ species: 'DOG', name: '운영자멍' }).expect(400)).body.code).toBe('INVALID_NAME');
    const r = await http().post('/api/v1/me/mate').set(u.auth).send({ species: 'CAT', name: '콩이' }).expect(201);
    expect(r.body).toMatchObject({ adopted: true, pet: { species: 'CAT', name: '콩이', costume: 'none' } });
    expect(r.body.evolutions).toEqual([expect.objectContaining({ level: 1, trigger: 'adopt' })]);
    expect((await http().post('/api/v1/me/mate').set(u.auth).send({ species: 'DOG' }).expect(409)).body.code).toBe('ALREADY_ADOPTED');
  });

  it('XP 로 진화(진화 기록), 5단계는 합격 인증 필요, 종류 바꿔도 XP 유지, 중복 이벤트 무시', async () => {
    const u = await signup(app);
    await http().post('/api/v1/me/mate').set(u.auth).send({ species: 'DOG' }).expect(201);
    await give(u.id, [{ eventKey: `t1:${u.id}`, sourceType: 'study', sourceId: 'x', deltaXp: 650 }]);
    await give(u.id, [{ eventKey: `t1:${u.id}`, sourceType: 'study', sourceId: 'x', deltaXp: 650 }]); // 중복
    let v = (await http().get('/api/v1/me/mate').set(u.auth).expect(200)).body;
    expect(v).toMatchObject({ xp: 650, level: 4, stage: { label: '어른' } });
    expect(v.evolutions.map((e: any) => e.level)).toEqual([1, 2, 3, 4]);
    await give(u.id, [{ eventKey: `t2:${u.id}`, sourceType: 'test', sourceId: 'y', deltaXp: 600 }]);
    v = (await http().get('/api/v1/me/mate').set(u.auth).expect(200)).body;
    expect(v).toMatchObject({ xp: 1250, level: 4, progress: { lockedByClear: true } }); // 합격 전
    await give(u.id, [{ eventKey: `clear:${u.id}`, sourceType: 'clear', sourceId: 'e', deltaXp: 150 }]);
    v = (await http().get('/api/v1/me/mate').set(u.auth).expect(200)).body;
    expect(v).toMatchObject({ level: 5, title: '클리어 마스터' });
    expect(v.badges.filter((b: any) => b.done).map((b: any) => b.id)).toEqual(['first-study', 'first-test', 'first-evolve', 'clear', 'clear-master']);
    expect(v.evolutions.at(-1)).toMatchObject({ level: 5, trigger: 'clear' });
    const sp = await http().patch('/api/v1/me/mate').set(u.auth).send({ species: 'CAT', name: '나비' }).expect(200);
    expect(sp.body).toMatchObject({ pet: { species: 'CAT', name: '나비' }, xp: 1400, level: 5 });
  });

  it('실제 공부 완료가 XP·진화로 이어짐 + 컨디션', async () => {
    const u = await signup(app);
    await http().post('/api/v1/me/mate').set(u.auth).send({ species: 'DOG' }).expect(201);
    const j = await http().post('/api/v1/challenges/is-open/join').set(u.auth).send({ plan: 'FREE' }).expect(201);
    await give(u.id, [{ eventKey: `pre:${u.id}`, sourceType: 'study', sourceId: 'x', deltaXp: 80 }]);
    const s = await http().post(`/api/v1/enrollments/${j.body.enrollment.id}/sessions`).set(u.auth).expect(201);
    await prisma.studySession.update({ where: { id: s.body.id }, data: { resumedAt: new Date(Date.now() - 90 * 60_000) } });
    const done = await http().post(`/api/v1/sessions/${s.body.id}/complete`).set(u.auth).expect(200);
    expect(done.body).toMatchObject({ minutes: 90, xp: 55, levelUp: 2 });
    const v = (await http().get('/api/v1/me/mate').set(u.auth).expect(200)).body;
    expect(v.condition.key).toBe('GREAT'); // 오늘 82분 이상
    expect(v.evolutions.at(-1)).toMatchObject({ level: 2, trigger: 'study' });
  });

  it('프리미엄 코스튬은 부스터 패스 보유자만', async () => {
    const u = await signup(app);
    await http().post('/api/v1/me/mate').set(u.auth).send({ species: 'DOG' }).expect(201);
    expect((await http().patch('/api/v1/me/mate').set(u.auth).send({ costume: 'crown' }).expect(403)).body.code).toBe('PREMIUM_REQUIRED');
    await http().patch('/api/v1/me/mate').set(u.auth).send({ costume: 'scarf' }).expect(200);
    const o = await http().post('/api/v1/payments/orders').set(u.auth).send({ offeringId: 'is-open' }).expect(201);
    await http().post('/api/v1/payments/confirm').set(u.auth).send({ orderNo: o.body.orderNo, paymentKey: `mock_ok_${o.body.orderNo}`, amount: 29000 }).expect(200);
    await http().post('/api/v1/challenges/is-open/join').set(u.auth).send({ plan: 'PREMIUM' }).expect(201);
    expect((await http().patch('/api/v1/me/mate').set(u.auth).send({ costume: 'crown' }).expect(200)).body.pet.costume).toBe('crown');
    // 환불로 패스가 회수되면 프리미엄 코스튬은 기본으로 표시
    await http().post(`/api/v1/payments/orders/${o.body.orderNo}/refund`).set(u.auth).expect(200);
    expect((await http().get('/api/v1/me/mate').set(u.auth).expect(200)).body.pet.costume).toBe('none');
  });

  it('주간 WIN 보너스: WIN 참여만 주당 1회 XP, 재실행 무변경, 배지·칭호', async () => {
    const people: { id: string; auth: Record<string, string> }[] = [];
    await prisma.challengeOffering.update({ where: { id: 'is-small' }, data: { freeCap: 100 } }); // 이 테스트 전용 회차 정원 확장
    for (const m of [60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 150]) {
      const u = await signup(app);
      const enr = (await http().post('/api/v1/challenges/is-small/join').set(u.auth).send({ plan: 'FREE' }).expect(201)).body.enrollment.id;
      await prisma.enrollment.update({ where: { id: enr }, data: { joinedAt: new Date(Date.now() - 10 * DAY) } });
      await prisma.studySession.createMany({ data: Array.from({ length: 7 }, (_, i) => ({ userId: u.id, enrollmentId: enr, status: 'COMPLETED' as const, startedAt: new Date(Date.now() - i * DAY - 3600_000), endedAt: new Date(Date.now() - i * DAY), minutes: m, elapsedSec: m * 60 })) });
      people.push(u);
    }
    const sa = await signup(app, { role: 'SUPER_ADMIN' });
    const r = await http().post('/api/v1/admin/gamification/weekly-wins').set(sa.auth).expect(200);
    expect(r.body.awarded).toBe(1);
    expect((await http().post('/api/v1/admin/gamification/weekly-wins').set(sa.auth).expect(200)).body.awarded).toBe(0);
    const winner = people[10];
    expect(await prisma.xpLedgerEntry.count({ where: { userId: winner.id, sourceType: 'weekly' } })).toBe(1);
    const v = (await http().get('/api/v1/me/mate').set(winner.auth).expect(200)).body;
    expect(v.badges.find((b: any) => b.id === 'weekly-win').done).toBe(true);
    expect(v.title).toBe('주간 승부사');
    expect(await prisma.xpLedgerEntry.count({ where: { userId: people[0].id, sourceType: 'weekly' } })).toBe(0);
    expect(await prisma.pointLedgerEntry.count({ where: { userId: winner.id } })).toBe(1); // 가입 축하만 — XP 는 포인트가 아님
  });
});
