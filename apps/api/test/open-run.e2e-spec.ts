import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, prisma, resetDb, signup } from './helpers';

describe('오픈런 · 신규 챌린지 개설 요청 (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  let admin: Awaited<ReturnType<typeof signup>>;

  beforeAll(async () => {
    await resetDb(); app = await createApp();
    admin = await signup(app, { role: 'SUPER_ADMIN' });
    await http().post('/api/v1/admin/policy').set(admin.auth).send({ version: '2026-11-v9.5', values: { openRunTarget: 3 } }).expect(201);
  });
  afterAll(async () => { await app.close(); await prisma.$disconnect(); });

  const create = (auth: Record<string, string>, body: Record<string, unknown>) => http().post('/api/v1/open-run').set(auth).send({ category: 'biz', ...body });
  const review = (id: string, body: Record<string, unknown>) => http().post(`/api/v1/admin/open-run/${id}/review`).set(admin.auth).send(body);

  it('연락처·금칙어 차단, 카탈로그에 있는 자격증은 기존 자격증 안내', async () => {
    const u = await signup(app);
    expect((await create(u.auth, { title: '보세사', reason: '같이해요 010-1234-5678' }).expect(400)).body.code).toBe('TEXT_CONTACT');
    expect((await create(u.auth, { title: '토토 분석사' }).expect(400)).body.code).toBe('TEXT_BANNED');
    const r = await create(u.auth, { title: '산업 안전기사 자격증' }).expect(409);
    expect(r.body).toMatchObject({ code: 'CERT_EXISTS', details: { certId: 'industrial-safety' } });
  });

  it('신규 요청은 운영자 검토 전 비공개 → 승인 후 공개·모집', async () => {
    const u = await signup(app);
    const c = await create(u.auth, { title: '보세사', round: '2027년 상반기', reason: '무역·물류 취업 준비생에게 필요해요' }).expect(201);
    expect(c.body).toMatchObject({ merged: false, request: { status: 'PENDING_REVIEW', interestCount: 1, targetCount: 3, interested: true } });
    const id = c.body.request.id;
    expect((await http().get('/api/v1/open-run').expect(200)).body.find((r: any) => r.id === id)).toBeUndefined();
    await http().get(`/api/v1/open-run/${id}`).expect(404);
    await http().get(`/api/v1/open-run/${id}`).set(u.auth).expect(200); // 요청자 본인은 조회 가능

    const other = await signup(app);
    await http().put(`/api/v1/open-run/${id}/interest`).set(other.auth).send({}).expect(409); // 검토 전 관심 불가
    await review(id, { action: 'OPEN', offeringId: 'is-open' }).expect(409); // 잘못된 전이
    expect((await review(id, { action: 'APPROVE' }).expect(201)).body.status).toBe('COLLECTING');
    expect((await http().get('/api/v1/open-run').expect(200)).body.some((r: any) => r.id === id)).toBe(true);
  });

  it('같은 이름(띄어쓰기·접미어 차이) 요청은 관심으로 병합, 목표 도달 시 THRESHOLD_REACHED, 취소 시 복귀', async () => {
    const a = await signup(app); const b = await signup(app); const c = await signup(app);
    const first = await create(a.auth, { title: '빅데이터분석기사' }).expect(201);
    const id = first.body.request.id;
    await review(id, { action: 'APPROVE' }).expect(201);
    const merged = await create(b.auth, { title: '빅데이터 분석기사 자격증' }).expect(201);
    expect(merged.body).toMatchObject({ merged: true, request: { id, interestCount: 2, status: 'COLLECTING' } });
    const third = await http().put(`/api/v1/open-run/${id}/interest`).set(c.auth).send({ notify: true }).expect(200);
    expect(third.body).toMatchObject({ interestCount: 3, status: 'THRESHOLD_REACHED', progress: 100 });
    // 같은 사람 중복 관심은 1명
    await http().put(`/api/v1/open-run/${id}/interest`).set(c.auth).send({}).expect(200);
    expect((await http().get(`/api/v1/open-run/${id}`).expect(200)).body.interestCount).toBe(3);
    const back = await http().delete(`/api/v1/open-run/${id}/interest`).set(c.auth).expect(200);
    expect(back.body).toMatchObject({ interestCount: 2, status: 'COLLECTING', interested: false });
  });

  it('동시 관심 10명 → 관심 수 정확 (경합 없음)', async () => {
    const owner = await signup(app);
    const id = (await create(owner.auth, { title: '경비지도사' }).expect(201)).body.request.id;
    await prisma.openRunRequest.update({ where: { id }, data: { targetCount: 100 } });
    await review(id, { action: 'APPROVE' }).expect(201);
    const users = await Promise.all(Array.from({ length: 10 }, () => signup(app)));
    await Promise.all(users.map((u) => http().put(`/api/v1/open-run/${id}/interest`).set(u.auth).send({})));
    const row = await prisma.openRunRequest.findUniqueOrThrow({ where: { id } });
    expect(row.interestCount).toBe(11);
    expect(await prisma.openRunInterest.count({ where: { requestId: id, active: true } })).toBe(11);
  });

  it('개설 처리: 심사 → 회차 연결(OPENED) + 알림 대상 수 + 감사 로그, 반려는 사유 필수', async () => {
    const a = await signup(app); const b = await signup(app); const c = await signup(app);
    const id = (await create(a.auth, { title: '조경기능사', category: 'life' }).expect(201)).body.request.id;
    await review(id, { action: 'APPROVE' }).expect(201);
    for (const u of [b, c]) await http().put(`/api/v1/open-run/${id}/interest`).set(u.auth).send({}).expect(200);
    await review(id, { action: 'START_REVIEW' }).expect(201);
    await http().put(`/api/v1/open-run/${id}/interest`).set((await signup(app)).auth).send({}).expect(409); // 심사 중엔 모집 종료
    const opened = await review(id, { action: 'OPEN', offeringId: 'is-open' }).expect(201);
    expect(opened.body).toMatchObject({ status: 'OPENED', linkedOfferingId: 'is-open', notifyCount: 3 });
    expect(await prisma.adminAuditLog.count({ where: { targetId: id, action: { startsWith: 'OPEN_RUN_' } } })).toBe(3);

    const d = await signup(app);
    const rid = (await create(d.auth, { title: '식품기사', category: 'food' }).expect(201)).body.request.id;
    await review(rid, { action: 'REJECT' }).expect(400);
    await review(rid, { action: 'REJECT', note: '시행 기관 일정 미정' }).expect(201);
    const mine = await http().get('/api/v1/me/open-run').set(d.auth).expect(200);
    expect(mine.body.requested[0]).toMatchObject({ status: 'REJECTED', reviewNote: '시행 기관 일정 미정' });
    expect((await create((await signup(app)).auth, { title: '식품 기사', category: 'food' }).expect(409)).body.code).toBe('REQUEST_REJECTED');
  });

  it('하루 신규 요청 한도(3건), 일반 회원은 심사 API 403', async () => {
    const u = await signup(app);
    for (const t of ['드론조종자A', '드론조종자B', '드론조종자C']) await create(u.auth, { title: t }).expect(201);
    expect((await create(u.auth, { title: '드론조종자D' }).expect(429)).body.code).toBe('DAILY_LIMIT');
    await http().get('/api/v1/admin/open-run').set(u.auth).expect(403);
  });
});
