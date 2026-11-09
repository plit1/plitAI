import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, prisma, resetDb, signup } from './helpers';

const SUBJECTS = ['산업안전관리론', '인간공학', '기계위험방지', '전기위험방지'];

describe('QUICK TEST (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => {
    await resetDb(); app = await createApp();
    // 과목당 6문항 (정답은 항상 index = 번호 % 4)
    await prisma.quizItem.createMany({ data: SUBJECTS.flatMap((subject, s) => Array.from({ length: 6 }, (_, i) => ({ certId: 'industrial-safety', subject, prompt: `${subject} 문항 ${i}`, options: ['가', '나', '다', '라'], answer: (s + i) % 4, source: '테스트', isSample: true, status: 'PUBLISHED' as const }))) });
    await prisma.quizItem.create({ data: { certId: 'industrial-safety', subject: SUBJECTS[0], prompt: '초안 문항', options: ['a', 'b'], answer: 0, source: '', status: 'DRAFT' } });
  });
  afterAll(async () => { await app.close(); await prisma.$disconnect(); });

  async function member(plan: 'FREE' | 'PREMIUM') {
    const u = await signup(app);
    if (plan === 'PREMIUM') {
      const o = await http().post('/api/v1/payments/orders').set(u.auth).send({ offeringId: 'is-open' }).expect(201);
      await http().post('/api/v1/payments/confirm').set(u.auth).send({ orderNo: o.body.orderNo, paymentKey: `mock_ok_${o.body.orderNo}`, amount: 29000 }).expect(200);
    }
    const j = await http().post('/api/v1/challenges/is-open/join').set(u.auth).send({ plan }).expect(201);
    return { ...u, enrollmentId: j.body.enrollment.id as string };
  }
  const answersFor = async (attemptId: string, correctCount: number) => {
    const a = await prisma.quizAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    const items = await prisma.quizItem.findMany({ where: { id: { in: a.itemIds } } });
    const byId = new Map(items.map((i) => [i.id, i]));
    return Object.fromEntries(a.itemIds.map((id, n) => [id, n < correctCount ? byId.get(id)!.answer : (byId.get(id)!.answer + 1) % 4]));
  };

  it('플릿런 회원은 403 PREMIUM_REQUIRED', async () => {
    const u = await member('FREE');
    expect((await http().post(`/api/v1/enrollments/${u.enrollmentId}/quiz`).set(u.auth).expect(403)).body.code).toBe('PREMIUM_REQUIRED');
  });

  it('출제: 20문항·과목 균형·초안 제외·정답 비노출, 제출 전 재요청은 같은 응시', async () => {
    const u = await member('PREMIUM');
    const r = await http().post(`/api/v1/enrollments/${u.enrollmentId}/quiz`).set(u.auth).expect(201);
    expect(r.body).toMatchObject({ kind: 'QUICK', title: 'QUICK TEST', total: 20, notice: '공식 기출 문제가 아닌 예시 문항이에요.' });
    expect(JSON.stringify(r.body)).not.toMatch(/"answer"|explanation|"correct"/);
    expect(r.body.items.map((i: any) => i.prompt)).not.toContain('초안 문항');
    const counts = SUBJECTS.map((s) => r.body.items.filter((i: any) => i.subject === s).length);
    expect(counts).toEqual([5, 5, 5, 5]);
    const again = await http().post(`/api/v1/enrollments/${u.enrollmentId}/quiz`).set(u.auth).expect(201);
    expect(again.body.id).toBe(r.body.id);
    // 남의 응시 조회 불가
    const other = await member('PREMIUM');
    await http().get(`/api/v1/quiz-attempts/${r.body.id}`).set(other.auth).expect(404);
  });

  it('미응답 거절 → 제출(15/20) 채점·학습기록·XP·미션·지표 전후 → 재제출 409 → 정답 공개', async () => {
    const u = await member('PREMIUM');
    const r = await http().post(`/api/v1/enrollments/${u.enrollmentId}/quiz`).set(u.auth).expect(201);
    const answers = await answersFor(r.body.id, 15);
    const partial = Object.fromEntries(Object.entries(answers).slice(0, 18));
    const miss = await http().post(`/api/v1/quiz-attempts/${r.body.id}/submit`).set(u.auth).send({ answers: partial }).expect(400);
    expect(miss.body).toMatchObject({ code: 'UNANSWERED', details: { missing: [19, 20] } });
    const bad = { ...answers, [Object.keys(answers)[0]]: 9 };
    expect((await http().post(`/api/v1/quiz-attempts/${r.body.id}/submit`).set(u.auth).send({ answers: bad }).expect(400)).body.code).toBe('INVALID_ANSWER');

    const s = await http().post(`/api/v1/quiz-attempts/${r.body.id}/submit`).set(u.auth).send({ answers }).expect(200);
    expect(s.body.result).toMatchObject({ correct: 15, total: 20, accuracy: 75, expectedScore: 68, passZone: true });
    expect(s.body.result.indexAfter).toBeGreaterThanOrEqual(s.body.result.indexBefore);
    expect(s.body.items[0]).toHaveProperty('answer');
    expect(s.body.items.filter((i: any) => i.correct)).toHaveLength(15);

    const rec = await prisma.studyRecord.findUniqueOrThrow({ where: { enrollmentId: u.enrollmentId } });
    expect(rec).toMatchObject({ accuracy: 75, expectedScore: 68 });
    expect((rec.missions as any[]).find((m) => /QUICK TEST/.test(m.title)).done).toBe(true);
    expect(await prisma.xpLedgerEntry.count({ where: { userId: u.id, sourceType: 'test' } })).toBe(1);
    await http().post(`/api/v1/quiz-attempts/${r.body.id}/submit`).set(u.auth).send({ answers }).expect(409);

    // 제출 후에는 새 응시 생성
    const next = await http().post(`/api/v1/enrollments/${u.enrollmentId}/quiz`).set(u.auth).expect(201);
    expect(next.body.id).not.toBe(r.body.id);
    const hist = await http().get(`/api/v1/enrollments/${u.enrollmentId}/quiz/history`).set(u.auth).expect(200);
    expect(hist.body).toHaveLength(1);
  });

  it('동시 제출 3건 → 1건만 반영 (XP 1회)', async () => {
    const u = await member('PREMIUM');
    const r = await http().post(`/api/v1/enrollments/${u.enrollmentId}/quiz`).set(u.auth).expect(201);
    const answers = await answersFor(r.body.id, 10);
    const rs = await Promise.all([1, 2, 3].map(() => http().post(`/api/v1/quiz-attempts/${r.body.id}/submit`).set(u.auth).send({ answers })));
    expect(rs.filter((x) => x.status === 200)).toHaveLength(1);
    expect(await prisma.xpLedgerEntry.count({ where: { userId: u.id, sourceType: 'test' } })).toBe(1);
  });

  it('시험 D-7 이하 FINAL CLEAR TEST, 시험 후 응시 불가', async () => {
    const u = await member('PREMIUM');
    await prisma.challengeOffering.update({ where: { id: 'is-open' }, data: { examDate: new Date(Date.now() + 5 * 86400000) } });
    const f = await http().post(`/api/v1/enrollments/${u.enrollmentId}/quiz`).set(u.auth).expect(201);
    expect(f.body).toMatchObject({ kind: 'FINAL', title: 'FINAL CLEAR TEST' });
    await prisma.challengeOffering.update({ where: { id: 'is-open' }, data: { examDate: new Date(Date.now() - 86400000) } });
    expect((await http().post(`/api/v1/enrollments/${u.enrollmentId}/quiz`).set(u.auth).expect(400)).body.code).toBe('EXAM_FINISHED');
    await prisma.challengeOffering.update({ where: { id: 'is-open' }, data: { examDate: new Date(Date.now() + 60 * 86400000) } });
  });

  it('관리자 문항 관리: 과목·정답 범위 검증, 출처 없는 공개 금지, 감사 로그', async () => {
    const op = await signup(app, { role: 'OPERATOR' });
    const base = { certId: 'industrial-safety', subject: '인간공학', prompt: '새 문항입니다', options: ['1', '2', '3'], answer: 1, source: '자체 제작' };
    expect((await http().post('/api/v1/admin/quiz-items').set(op.auth).send({ ...base, subject: '없는과목' }).expect(400)).body.code).toBe('INVALID_SUBJECT');
    expect((await http().post('/api/v1/admin/quiz-items').set(op.auth).send({ ...base, answer: 3 }).expect(400)).body.code).toBe('INVALID_ANSWER');
    const c = await http().post('/api/v1/admin/quiz-items').set(op.auth).send(base).expect(201);
    expect(c.body.status).toBe('DRAFT');
    const draft = await prisma.quizItem.findFirstOrThrow({ where: { prompt: '초안 문항' } });
    expect((await http().patch(`/api/v1/admin/quiz-items/${draft.id}`).set(op.auth).send({ status: 'PUBLISHED' }).expect(400)).body.code).toBe('SOURCE_REQUIRED');
    await http().patch(`/api/v1/admin/quiz-items/${c.body.id}`).set(op.auth).send({ status: 'PUBLISHED' }).expect(200);
    expect(await prisma.adminAuditLog.count({ where: { targetId: c.body.id } })).toBe(2);
    await http().get('/api/v1/admin/quiz-items').set((await signup(app)).auth).expect(403);
  });
});
