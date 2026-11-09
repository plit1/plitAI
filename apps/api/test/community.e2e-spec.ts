import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, prisma, resetDb, signup } from './helpers';

describe('커뮤니티 (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => { await resetDb(); app = await createApp(); });
  afterAll(async () => { await app.close(); await prisma.$disconnect(); });
  const post = (auth: Record<string, string>, body: Record<string, unknown>) => http().post('/api/v1/community/posts').set(auth).send({ category: '질문', title: '전기 과목 공부 순서', body: '어떤 순서로 보셨나요? 조언 부탁드려요.', ...body });

  it('작성 검증: 카테고리·길이·연락처·금칙어, 비회원 작성 불가', async () => {
    const u = await signup(app);
    await http().post('/api/v1/community/posts').send({ category: '질문', title: '제목', body: '본문입니다' }).expect(401);
    expect((await post(u.auth, { category: '잡담' }).expect(400)).body.code).toBe('VALIDATION');
    expect((await post(u.auth, { title: '가' }).expect(400)).body.code).toBe('TITLE_LENGTH');
    expect((await post(u.auth, { body: '연락주세요 010-1234-5678 입니다' }).expect(400)).body.code).toBe('TEXT_CONTACT');
    expect((await post(u.auth, { body: '토토 사이트 홍보합니다' }).expect(400)).body.code).toBe('TEXT_BANNED');
  });

  it('목록·검색·카테고리·자격증 필터, 비회원 조회 가능', async () => {
    const u = await signup(app);
    await post(u.auth, { title: '전기위험방지 합격 후기', category: '합격 후기', certId: 'industrial-safety', body: '오답 복습이 제일 도움이 됐어요.' }).expect(201);
    const all = await http().get('/api/v1/community/posts').expect(200);
    expect(all.body.items[0]).toMatchObject({ title: '전기위험방지 합격 후기', certName: '산업안전기사', origin: 'COMMUNITY' });
    expect((await http().get('/api/v1/community/posts?category=합격 후기').expect(200)).body.items.every((p: any) => p.category === '합격 후기')).toBe(true);
    expect((await http().get('/api/v1/community/posts?q=오답 복습').expect(200)).body.items).toHaveLength(1);
    expect((await http().get('/api/v1/community/posts?certId=industrial-safety').expect(200)).body.items).toHaveLength(1);
  });

  it('조회수 1인 1일 1회, 비회원은 미반영', async () => {
    const u = await signup(app); const v = await signup(app);
    const id = (await post(u.auth, {}).expect(201)).body.id;
    await http().get(`/api/v1/community/posts/${id}`).set(v.auth).expect(200);
    await http().get(`/api/v1/community/posts/${id}`).set(v.auth).expect(200);
    await http().get(`/api/v1/community/posts/${id}`).expect(200);
    expect((await prisma.communityPost.findUniqueOrThrow({ where: { id } })).viewCount).toBe(1);
  });

  it('좋아요: 동시 5회 눌러도 1개, 취소', async () => {
    const u = await signup(app); const v = await signup(app);
    const id = (await post(u.auth, {}).expect(201)).body.id;
    await Promise.all(Array.from({ length: 5 }, () => http().put(`/api/v1/community/posts/${id}/like`).set(v.auth)));
    expect((await prisma.communityPost.findUniqueOrThrow({ where: { id } })).likeCount).toBe(1);
    const off = await http().delete(`/api/v1/community/posts/${id}/like`).set(v.auth).expect(200);
    expect(off.body).toEqual({ liked: false, likeCount: 0 });
    await http().delete(`/api/v1/community/posts/${id}/like`).set(v.auth).expect(200);
    expect((await prisma.communityPost.findUniqueOrThrow({ where: { id } })).likeCount).toBe(0);
  });

  it('댓글: 작성·필터·본인만 삭제(자리 유지)·댓글 수', async () => {
    const u = await signup(app); const v = await signup(app);
    const id = (await post(u.auth, {}).expect(201)).body.id;
    expect((await http().post(`/api/v1/community/posts/${id}/comments`).set(v.auth).send({ body: '오픈채팅 들어오세요' }).expect(400)).body.code).toBe('TEXT_CONTACT');
    const c = await http().post(`/api/v1/community/posts/${id}/comments`).set(v.auth).send({ body: '정전기 → 감전 → 방폭 순서로 봤어요!' }).expect(201);
    await http().delete(`/api/v1/community/comments/${c.body.id}`).set(u.auth).expect(403);
    await http().delete(`/api/v1/community/comments/${c.body.id}`).set(v.auth).expect(204);
    const d = await http().get(`/api/v1/community/posts/${id}`).expect(200);
    expect(d.body.comments[0]).toMatchObject({ deleted: true, body: '' });
    expect(d.body.commentCount).toBe(0);
  });

  it('본인 글 삭제, 남의 글 삭제 403', async () => {
    const u = await signup(app); const v = await signup(app);
    const id = (await post(u.auth, {}).expect(201)).body.id;
    await http().delete(`/api/v1/community/posts/${id}`).set(v.auth).expect(403);
    await http().delete(`/api/v1/community/posts/${id}`).set(u.auth).expect(204);
    await http().get(`/api/v1/community/posts/${id}`).expect(404);
  });

  it('신고: 신고자 화면에서 즉시 가림, 중복·본인 신고 불가 → 운영 숨김(전체) → 복구, 감사 로그', async () => {
    const u = await signup(app); const v = await signup(app); const w = await signup(app);
    const op = await signup(app, { role: 'OPERATOR' });
    const id = (await post(u.auth, { title: '신고 대상 글입니다' }).expect(201)).body.id;
    await http().post('/api/v1/reports').set(u.auth).send({ targetType: 'POST', targetId: id, reason: '본인' }).expect(400);
    await http().post('/api/v1/reports').set(v.auth).send({ targetType: 'POST', targetId: id, reason: '광고성' }).expect(201);
    await http().post('/api/v1/reports').set(v.auth).send({ targetType: 'POST', targetId: id, reason: '광고성' }).expect(409);
    const ids = async (auth?: Record<string, string>) => (await (auth ? http().get('/api/v1/community/posts').set(auth) : http().get('/api/v1/community/posts')).expect(200)).body.items.map((p: any) => p.id);
    expect(await ids(v.auth)).not.toContain(id);
    expect(await ids(w.auth)).toContain(id);

    const q = await http().get('/api/v1/admin/reports').set(op.auth).expect(200);
    const rep = q.body.find((r: any) => r.targetId === id);
    expect(rep).toMatchObject({ targetType: 'POST', excerpt: '신고 대상 글입니다', status: 'PENDING' });
    await http().post(`/api/v1/admin/reports/${rep.id}/moderate`).set(v.auth).send({ action: 'hide' }).expect(403);
    const h = await http().post(`/api/v1/admin/reports/${rep.id}/moderate`).set(op.auth).send({ action: 'hide' }).expect(201);
    expect(h.body).toMatchObject({ reportsHandled: 1, contentStatus: 'HIDDEN' });
    expect(await ids(w.auth)).not.toContain(id);
    await http().get(`/api/v1/community/posts/${id}`).expect(404);
    await http().post(`/api/v1/admin/reports/${rep.id}/moderate`).set(op.auth).send({ action: 'restore' }).expect(201);
    expect(await ids(w.auth)).toContain(id);
    expect(await prisma.adminAuditLog.count({ where: { targetId: id, action: { startsWith: 'REPORT_' } } })).toBe(2);
  });

  it('차단: 차단한 사람의 글·댓글이 내 화면에서 사라짐, 해제 시 복귀', async () => {
    const u = await signup(app); const v = await signup(app);
    const id = (await post(u.auth, { title: '차단 테스트 글입니다' }).expect(201)).body.id;
    const w = await signup(app);
    const other = (await post(w.auth, { title: '다른 사람이 쓴 글입니다' }).expect(201)).body.id;
    await http().post(`/api/v1/community/posts/${other}/comments`).set(u.auth).send({ body: '차단될 사람의 댓글입니다' }).expect(201);
    await http().put(`/api/v1/me/blocks/${v.id}`).set(v.auth).expect(400);
    await http().put(`/api/v1/me/blocks/${u.id}`).set(v.auth).expect(204);
    expect((await http().get('/api/v1/community/posts').set(v.auth).expect(200)).body.items.map((p: any) => p.id)).not.toContain(id);
    const seen = await http().get(`/api/v1/community/posts/${other}`).set(v.auth).expect(200);
    expect(seen.body.comments).toHaveLength(0); // 차단한 사람의 댓글 숨김
    expect((await http().get(`/api/v1/community/posts/${other}`).set(w.auth).expect(200)).body.comments).toHaveLength(1);
    expect((await http().get('/api/v1/me/blocks').set(v.auth).expect(200)).body[0].userId).toBe(u.id);
    await http().delete(`/api/v1/me/blocks/${u.id}`).set(v.auth).expect(204);
    expect((await http().get('/api/v1/community/posts').set(v.auth).expect(200)).body.items.map((p: any) => p.id)).toContain(id);
  });

  it('작성 속도 제한: 1분 3개', async () => {
    const u = await signup(app);
    for (let i = 0; i < 3; i++) await post(u.auth, { title: `연속 작성 ${i}번째 글` }).expect(201);
    expect((await post(u.auth, { title: '네 번째 글입니다' }).expect(429)).body.code).toBe('POST_RATE');
  });
});
