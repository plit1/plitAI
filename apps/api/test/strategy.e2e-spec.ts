import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AI_CLIENT, AiClient } from '../src/modules/strategy/ai.client';

// AppModule 이 import 될 때 설정을 검증하므로, 한도는 helpers 를 동적 import 하기 전에 지정
process.env.AI_DAILY_LIMIT_PREMIUM = '3';

/** 가짜 Claude 클라이언트: 다음 응답을 큐로 지정, 받은 요청을 기록 */
const calls: any[] = [];
let next: (() => any) | null = null;
const fake: AiClient = {
  async create(params) {
    calls.push(params);
    const r = next ? next() : { text: '시험까지 남은 기간을 생각하면 오늘 계획을 지키는 게 중요해요. 약한 과목부터 차근차근 보강해요.' };
    if (r instanceof Error) throw r;
    return { id: 'msg', type: 'message', role: 'assistant', model: r.model ?? params.model, stop_reason: r.stop ?? 'end_turn', stop_sequence: null,
      content: r.stop === 'refusal' ? [] : [{ type: 'text', text: r.text, citations: null }], usage: { input_tokens: 500, output_tokens: 80, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } as any;
  },
};

describe('AI 학습전략·CLEAR MODE·코칭 (e2e, 가짜 Claude)', () => {
  let app: INestApplication;
  let h: typeof import('./helpers');
  const http = () => request(app.getHttpServer());
  const signup: typeof import('./helpers')['signup'] = (...a) => h.signup(...a);
  beforeAll(async () => {
    h = await import('./helpers');
    await h.resetDb();
    app = await h.createApp((b) => b.overrideProvider(AI_CLIENT).useValue(fake));
  });
  afterAll(async () => { delete process.env.AI_DAILY_LIMIT_PREMIUM; await app.close(); await h.prisma.$disconnect(); });
  beforeEach(() => { next = null; calls.length = 0; });

  async function member(plan: 'FREE' | 'PREMIUM') {
    const u = await signup(app);
    if (plan === 'PREMIUM') {
      const o = await http().post('/api/v1/payments/orders').set(u.auth).send({ offeringId: 'is-open' }).expect(201);
      await http().post('/api/v1/payments/confirm').set(u.auth).send({ orderNo: o.body.orderNo, paymentKey: `mock_ok_${o.body.orderNo}`, amount: 29000 }).expect(200);
    }
    const j = await http().post('/api/v1/challenges/is-open/join').set(u.auth).send({ plan }).expect(201);
    return { ...u, enrollmentId: j.body.enrollment.id as string };
  }

  it('플릿런은 전략·코칭·CLEAR MODE 403', async () => {
    const u = await member('FREE');
    for (const [m, p] of [['get', 'strategy'], ['post', 'strategy/apply'], ['post', 'coach'], ['post', 'clear-mode']] as const) {
      expect((await (http() as any)[m](`/api/v1/enrollments/${u.enrollmentId}/${p}`).set(u.auth).expect(403)).body.code).toBe('PREMIUM_REQUIRED');
    }
    expect(calls).toHaveLength(0);
  });

  it('전략: 주간 부족분 → 권장 시간 상향·미션 45/30/25, 같은 부족분 재적용 시 변경 없음', async () => {
    const u = await member('PREMIUM');
    const v = await http().get(`/api/v1/enrollments/${u.enrollmentId}/strategy`).set(u.auth).expect(200);
    expect(v.body.gap).toMatchObject({ deficit: 540, extraPerDay: 135, newRecommended: 217 });
    expect(v.body.upToDate).toBe(false);
    const a = await http().post(`/api/v1/enrollments/${u.enrollmentId}/strategy/apply`).set(u.auth).expect(200);
    expect(a.body).toMatchObject({ changed: true, recommended: 217 });
    expect(a.body.missions.map((m: any) => m.minutes)).toEqual([98, 65, 54]);
    expect((await http().post(`/api/v1/enrollments/${u.enrollmentId}/strategy/apply`).set(u.auth).expect(200)).body.changed).toBe(false);
    const d = await http().get(`/api/v1/enrollments/${u.enrollmentId}/dashboard`).set(u.auth).expect(200);
    expect(d.body.record.appliedPlan).toMatchObject({ key: 'gap:540', recommended: 217 });
  });

  it('CLEAR MODE: D-7 전에는 거절, D-7 이하 시작 + 40/30/30 배분', async () => {
    const u = await member('PREMIUM');
    expect((await http().post(`/api/v1/enrollments/${u.enrollmentId}/clear-mode`).set(u.auth).expect(400)).body.code).toBe('CLEAR_MODE_NOT_YET');
    await h.prisma.challengeOffering.update({ where: { id: 'is-open' }, data: { examDate: new Date(Date.now() + 5 * 86400000) } });
    const r = await http().post(`/api/v1/enrollments/${u.enrollmentId}/clear-mode`).set(u.auth).expect(200);
    expect(r.body).toMatchObject({ started: true, allocation: { review: 33, weak: 25, past: 24, total: 82 } });
    await h.prisma.challengeOffering.update({ where: { id: 'is-open' }, data: { examDate: new Date(Date.now() + 60 * 86400000) } });
  });

  it('코칭: 요청 형태(모델·effort·fallback) 검증, AI 문장 반환, 비용 로그', async () => {
    const u = await member('PREMIUM');
    const r = await http().post(`/api/v1/enrollments/${u.enrollmentId}/coach`).set(u.auth).expect(200);
    expect(r.body).toMatchObject({ source: 'AI', remainingToday: 2 });
    expect(calls[0]).toMatchObject({ model: 'claude-opus-5-5', output_config: { effort: 'low' }, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
    expect(calls[0].thinking).toBeUndefined(); // Opus 5.5 는 disabled 불가 → 아예 보내지 않음
    const facts = JSON.parse(calls[0].messages[0].content);
    expect(facts).toMatchObject({ certName: '산업안전기사', weekRequiredMin: 540, todayRecommendedMin: 217 });
    const log = await h.prisma.aiUsageLog.findFirstOrThrow({ where: { userId: u.id } });
    expect(log).toMatchObject({ success: true, model: 'claude-opus-5-5', inputTokens: 500, outputTokens: 80, costMicroUsd: 500 * 4 + 80 * 20 });
  });

  it('LLM 이 만든 숫자·금지 표현 → 규칙 문장으로 대체 (로그는 실패)', async () => {
    const u = await member('PREMIUM');
    next = () => ({ text: '이 페이스면 합격 가능성이 73%예요. 오늘도 힘내요!' });
    const r = await http().post(`/api/v1/enrollments/${u.enrollmentId}/coach`).set(u.auth).expect(200);
    expect(r.body).toMatchObject({ source: 'RULES', reason: 'AI_OUTPUT_REJECTED:UNKNOWN_NUMBER:73' });
    expect(r.body.message).toContain('217분');
    next = () => ({ text: '오늘 계획을 지키면 합격 확률이 크게 올라가요. 꾸준히 해봐요.' });
    expect((await http().post(`/api/v1/enrollments/${u.enrollmentId}/coach`).set(u.auth).expect(200)).body.reason).toBe('AI_OUTPUT_REJECTED:FORBIDDEN_PHRASE');
    expect(await h.prisma.aiUsageLog.count({ where: { userId: u.id, success: false } })).toBe(2);
  });

  it('거절(refusal)·API 오류 → 규칙 문장, 일일 한도(3회) 초과 시 호출 안 함', async () => {
    const u = await member('PREMIUM');
    next = () => ({ stop: 'refusal' });
    expect((await http().post(`/api/v1/enrollments/${u.enrollmentId}/coach`).set(u.auth).expect(200)).body).toMatchObject({ source: 'RULES', reason: 'AI_REFUSAL' });
    next = () => new Error('boom');
    expect((await http().post(`/api/v1/enrollments/${u.enrollmentId}/coach`).set(u.auth).expect(200)).body).toMatchObject({ source: 'RULES', reason: 'AI_ERROR:UNKNOWN' });
    next = null;
    expect((await http().post(`/api/v1/enrollments/${u.enrollmentId}/coach`).set(u.auth).expect(200)).body).toMatchObject({ source: 'AI', remainingToday: 0 });
    const before = calls.length;
    const lim = await http().post(`/api/v1/enrollments/${u.enrollmentId}/coach`).set(u.auth).expect(200);
    expect(lim.body).toMatchObject({ source: 'RULES', reason: 'DAILY_LIMIT', remainingToday: 0 });
    expect(calls.length).toBe(before);
  });

  it('관리자 AI 사용량·비용 집계', async () => {
    const op = await signup(app, { role: 'OPERATOR' });
    const r = await http().get('/api/v1/admin/ai-usage?days=7').set(op.auth).expect(200);
    expect(r.body.totalUsd).toBeGreaterThan(0);
    expect(r.body.rows.some((x: any) => x.model === 'claude-opus-5-5' && x.success)).toBe(true);
  });
});
