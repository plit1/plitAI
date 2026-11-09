import { INestApplication } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { createApp, prisma, resetDb, signup } from './helpers';

const DAY = 86400000;

describe('스터디룸 실시간 채팅 (e2e, socket.io)', () => {
  let app: INestApplication;
  let url: string;
  const sockets: Socket[] = [];
  const http = () => request(app.getHttpServer());
  beforeAll(async () => {
    await resetDb(); app = await createApp();
    await app.listen(0);
    url = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}/study-room`;
  });
  afterAll(async () => { sockets.forEach((s) => s.close()); await app.close(); await prisma.$disconnect(); });

  async function member() {
    const u = await signup(app);
    const j = await http().post('/api/v1/challenges/is-open/join').set(u.auth).send({ plan: 'FREE' }).expect(201);
    return { ...u, enrollmentId: j.body.enrollment.id as string };
  }
  function connect(token?: string) {
    const s = io(url, { auth: token ? { token } : {}, transports: ['websocket'], forceNew: true });
    sockets.push(s);
    return s;
  }
  const emit = (s: Socket, ev: string, data: unknown) => new Promise<any>((res) => s.emit(ev, data, res));
  const waitFor = (s: Socket, ev: string, ms = 3000) => new Promise<any>((res, rej) => { const t = setTimeout(() => rej(new Error(`timeout ${ev}`)), ms); s.once(ev, (d) => { clearTimeout(t); res(d); }); });

  it('토큰 없음·위조 토큰은 연결 거부(connect_error), 비참여자는 입장 불가', async () => {
    const anon = connect();
    expect((await waitFor(anon, 'connect_error')).message).toBe('UNAUTHORIZED');
    const forged = connect('not.a.jwt');
    expect((await waitFor(forged, 'connect_error')).message).toBe('UNAUTHORIZED');
    const outsider = await signup(app);
    const s = connect(outsider.token);
    await waitFor(s, 'connect');
    expect(await emit(s, 'join', { roomId: 'is-open' })).toMatchObject({ ok: false, code: 'NOT_PARTICIPANT' });
    expect(await emit(s, 'send', { roomId: 'is-open', body: '들어가도 되나요' })).toMatchObject({ ok: false, code: 'NOT_JOINED' });
    await http().get('/api/v1/study-rooms/is-open/messages').set(outsider.auth).expect(403);
  });

  it('참여자 두 명: 보낸 메시지가 상대에게 실시간 전달 + 기록 조회, REST 전송도 방송', async () => {
    const a = await member(); const b = await member();
    const sa = connect(a.token); const sb = connect(b.token);
    await Promise.all([waitFor(sa, 'connect'), waitFor(sb, 'connect')]);
    const ja = await emit(sa, 'join', { roomId: 'is-open' });
    expect(ja).toMatchObject({ ok: true, data: { summary: { state: 'ACTIVE', canWrite: true, certName: '산업안전기사' } } });
    await emit(sb, 'join', { roomId: 'is-open' });
    const got = waitFor(sb, 'message');
    const sent = await emit(sa, 'send', { roomId: 'is-open', body: '오늘 전기위험방지 같이 해요' });
    expect(sent.ok).toBe(true);
    expect(await got).toMatchObject({ body: '오늘 전기위험방지 같이 해요', authorId: a.id });
    const viaRest = waitFor(sa, 'message');
    await http().post('/api/v1/study-rooms/is-open/messages').set(b.auth).send({ body: 'REST 로 보낸 메시지' }).expect(201);
    expect((await viaRest).body).toBe('REST 로 보낸 메시지');
    const hist = await http().get('/api/v1/study-rooms/is-open/messages').set(a.auth).expect(200);
    expect(hist.body.map((m: any) => m.body).slice(-2)).toEqual(['오늘 전기위험방지 같이 해요', 'REST 로 보낸 메시지']);
  });

  it('서버 가드: 2초 내 재전송 RATE, 연락처 차단, 300자 초과 (WebSocket)', async () => {
    const a = await member();
    const s = connect(a.token); await waitFor(s, 'connect'); await emit(s, 'join', { roomId: 'is-open' });
    expect((await emit(s, 'send', { roomId: 'is-open', body: '첫 메시지' })).ok).toBe(true);
    expect(await emit(s, 'send', { roomId: 'is-open', body: '바로 두 번째' })).toMatchObject({ ok: false, code: 'RATE' });
    const b = await member();
    const sb = connect(b.token); await waitFor(sb, 'connect'); await emit(sb, 'join', { roomId: 'is-open' });
    expect(await emit(sb, 'send', { roomId: 'is-open', body: '카톡 아이디 알려드릴게요' })).toMatchObject({ ok: false, code: 'TEXT_CONTACT' });
    expect(await emit(sb, 'send', { roomId: 'is-open', body: '가'.repeat(301) })).toMatchObject({ ok: false, code: 'TEXT_LENGTH' });
  });

  it('채팅 신고: 신고자 기록에서 가려짐, 다른 참여자는 보임', async () => {
    const a = await member(); const b = await member(); const c = await member();
    const m = await http().post('/api/v1/study-rooms/is-open/messages').set(a.auth).send({ body: '신고될 메시지입니다' }).expect(201);
    await http().post('/api/v1/reports').set(b.auth).send({ targetType: 'CHAT', targetId: m.body.id, reason: '도배' }).expect(201);
    const ids = async (u: { auth: Record<string, string> }) => (await http().get('/api/v1/study-rooms/is-open/messages').set(u.auth).expect(200)).body.map((x: any) => x.id);
    expect(await ids(b)).not.toContain(m.body.id);
    expect(await ids(c)).toContain(m.body.id);
  });

  it('스터디룸 글: 공개 고지 확인 필요 → 전체 커뮤니티 노출(단일 원본), 자동 공개 끄면 참여자 전용', async () => {
    const a = await member(); const outsider = await signup(app);
    const op = await signup(app, { role: 'OPERATOR' });
    const body = { category: '질문', title: '인간공학 질문 있어요', body: '근골격계 부담작업 기준이 헷갈려요.' };
    const need = await http().post('/api/v1/study-rooms/is-open/posts').set(a.auth).send(body).expect(428);
    expect(need.body.code).toBe('NOTICE_REQUIRED');
    const p = await http().post('/api/v1/study-rooms/is-open/posts').set(a.auth).send({ ...body, ack: true }).expect(201);
    expect(p.body).toMatchObject({ isPublic: true, origin: 'STUDY_ROOM' });
    const pub = await http().get('/api/v1/community/posts').expect(200);
    expect(pub.body.items.find((x: any) => x.id === p.body.id)).toMatchObject({ origin: 'STUDY_ROOM', roomId: 'is-open', certName: '산업안전기사' });
    await http().post('/api/v1/study-rooms/is-open/posts').set(a.auth).send({ ...body, title: '두 번째 질문입니다' }).expect(201); // 고지는 버전당 1회

    await http().patch('/api/v1/admin/study-rooms/is-open').set(op.auth).send({ autoShare: false }).expect(200);
    const priv = await http().post('/api/v1/study-rooms/is-open/posts').set(a.auth).send({ ...body, title: '참여자끼리만 보는 글' }).expect(201);
    expect(priv.body.isPublic).toBe(false);
    expect((await http().get('/api/v1/community/posts').expect(200)).body.items.map((x: any) => x.id)).not.toContain(priv.body.id);
    await http().get(`/api/v1/community/posts/${priv.body.id}`).set(outsider.auth).expect(404);
    await http().get(`/api/v1/community/posts/${priv.body.id}`).set(a.auth).expect(200);
    expect((await http().get('/api/v1/study-rooms/is-open/posts').set(a.auth).expect(200)).body.items.map((x: any) => x.id)).toContain(priv.body.id);
    await http().patch('/api/v1/admin/study-rooms/is-open').set(op.auth).send({ autoShare: true }).expect(200);
  });

  it('종료 → 7일 읽기 전용(쓰기 거절·읽기 가능) → 보관: 채팅 삭제·신고분 보존·게시글 유지, 재실행 안전', async () => {
    const a = await member(); const b = await member();
    const op = await signup(app, { role: 'OPERATOR' }); const sa = await signup(app, { role: 'SUPER_ADMIN' });
    const kept = await http().post('/api/v1/study-rooms/is-open/messages').set(a.auth).send({ body: '분쟁 메시지 보존 대상' }).expect(201);
    await http().post('/api/v1/reports').set(b.auth).send({ targetType: 'CHAT', targetId: kept.body.id, reason: '분쟁' }).expect(201);
    const postsBefore = await prisma.communityPost.count({ where: { roomId: 'is-open' } });

    await http().patch('/api/v1/admin/study-rooms/is-open').set(op.auth).send({ closeAt: new Date(Date.now() - 2 * DAY).toISOString() }).expect(200);
    const sum = await http().get('/api/v1/study-rooms/is-open').set(a.auth).expect(200);
    expect(sum.body).toMatchObject({ state: 'READ_ONLY', canWrite: false });
    expect((await http().post('/api/v1/study-rooms/is-open/messages').set(a.auth).send({ body: '종료 후 메시지' }).expect(403)).body.code).toBe('ROOM_CLOSED');
    expect((await http().get('/api/v1/study-rooms/is-open/messages').set(a.auth).expect(200)).body.length).toBeGreaterThan(0);

    await http().post('/api/v1/admin/study-rooms/purge').set(sa.auth).expect(200).expect((r) => expect(r.body.rooms).toHaveLength(0)); // 아직 7일 안 지남
    await http().patch('/api/v1/admin/study-rooms/is-open').set(op.auth).send({ closeAt: new Date(Date.now() - 8 * DAY).toISOString() }).expect(200);
    // 이 방의 미처리 채팅 신고 대상 수 = 보존본 수 (앞선 테스트의 신고 포함)
    const flagged = new Set((await prisma.contentReport.findMany({ where: { roomId: 'is-open', targetType: 'CHAT', status: { in: ['PENDING', 'HIDDEN'] } } })).map((x) => x.targetId)).size;
    const r = await http().post('/api/v1/admin/study-rooms/purge').set(sa.auth).expect(200);
    expect(r.body.rooms[0]).toMatchObject({ roomId: 'is-open', held: flagged });
    expect(flagged).toBeGreaterThanOrEqual(1);
    expect(r.body.rooms[0].deleted).toBeGreaterThan(1);
    expect(await prisma.chatMessage.count({ where: { roomId: 'is-open' } })).toBe(0);
    expect(await prisma.chatHold.findUniqueOrThrow({ where: { messageId: kept.body.id } })).toMatchObject({ body: '분쟁 메시지 보존 대상' });
    expect(await prisma.communityPost.count({ where: { roomId: 'is-open' } })).toBe(postsBefore);
    expect((await http().get('/api/v1/study-rooms/is-open').set(a.auth).expect(200)).body.state).toBe('ARCHIVED');
    expect((await http().post('/api/v1/admin/study-rooms/purge').set(sa.auth).expect(200)).body.rooms).toHaveLength(0);
    expect((await http().patch('/api/v1/admin/study-rooms/is-open').set(op.auth).send({ closeAt: null }).expect(400)).body.code).toBe('ALREADY_PURGED');
  });
});
