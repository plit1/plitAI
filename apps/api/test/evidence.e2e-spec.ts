import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, prisma, resetDb, signup } from './helpers';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);

describe('합격 증빙 저장·심사자 열람·시험 회차 연결 (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => { process.env.UPLOAD_DIR = '/tmp/plit-test-uploads'; await resetDb(); app = await createApp(); });
  afterAll(async () => { await app.close(); await prisma.$disconnect(); });

  async function submitted(examRoundId?: string) {
    const u = await signup(app);
    const j = await http().post('/api/v1/challenges/is-open/join').set(u.auth).send({ plan: 'FREE' }).expect(201);
    await prisma.challengeOffering.update({ where: { id: 'is-open' }, data: { examDate: new Date(Date.now() - 86400000) } });
    const up = await http().post('/api/v1/uploads/evidence').set(u.auth).attach('file', PNG, 'p.png').expect(201);
    const s = await http().post(`/api/v1/enrollments/${j.body.enrollment.id}/verification`).set(u.auth).send({ examNumber: '12345678', evidenceKey: up.body.key, ...(examRoundId ? { examRoundId } : {}) });
    await prisma.challengeOffering.update({ where: { id: 'is-open' }, data: { examDate: new Date(Date.now() + 60 * 86400000) } });
    return { u, s, enrollmentId: j.body.enrollment.id as string };
  }

  it('심사자는 증빙 원본을 열람(보안 헤더) + 열람마다 감사 로그, 일반 회원·본인도 관리자 경로 403', async () => {
    const { u, s } = await submitted();
    expect(s.status).toBe(201);
    const op = await signup(app, { role: 'OPERATOR' });
    const r = await http().get(`/api/v1/admin/verifications/${s.body.id}/evidence`).set(op.auth).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); }).expect(200);
    expect(Buffer.compare(r.body, PNG)).toBe(0);
    expect(r.headers).toMatchObject({ 'content-type': 'image/png', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    expect(r.headers['content-security-policy']).toContain('sandbox');
    await http().get(`/api/v1/admin/verifications/${s.body.id}/evidence`).set(op.auth).expect(200);
    expect(await prisma.adminAuditLog.count({ where: { action: 'EVIDENCE_VIEW', targetId: s.body.id, actorId: op.id } })).toBe(2);
    await http().get(`/api/v1/admin/verifications/${s.body.id}/evidence`).set(u.auth).expect(403);
    const q = await http().get('/api/v1/admin/verifications').set(op.auth).expect(200);
    expect(q.body.find((x: any) => x.id === s.body.id)).toMatchObject({ hasEvidence: true, examRound: null });
  });

  it('다른 자격증의 시험 회차 연결 거절, 맞는 회차는 심사 큐에 회차명 표시', async () => {
    await prisma.certification.upsert({ where: { id: 'barista' }, create: { id: 'barista', name: '바리스타 2급', field: 'food', qualType: '민간', challengeType: 'exam', issuer: 'x', difficulty: 2, tagline: 't', passRule: 'p', subjects: ['a'] }, update: {} });
    const wrong = await prisma.examRound.create({ data: { certId: 'barista', label: '2027년 1회', examDate: new Date('2027-03-01T00:00:00+09:00') } });
    const right = await prisma.examRound.create({ data: { certId: 'industrial-safety', label: '2027년 1회', examDate: new Date('2027-02-20T00:00:00+09:00'), resultDate: new Date('2027-03-12T00:00:00+09:00') } });
    const bad = await submitted(wrong.id);
    expect(bad.s.status).toBe(400);
    expect(bad.s.body.code).toBe('INVALID_EXAM_ROUND');
    const ok = await submitted(right.id);
    expect(ok.s.status).toBe(201);
    const op = await signup(app, { role: 'OPERATOR' });
    const q = await http().get('/api/v1/admin/verifications').set(op.auth).expect(200);
    expect(q.body.find((x: any) => x.id === ok.s.body.id).examRound).toMatchObject({ label: '2027년 1회' });
  });

  it('없는 심사 ID 404', async () => {
    const op = await signup(app, { role: 'OPERATOR' });
    await http().get('/api/v1/admin/verifications/nope/evidence').set(op.auth).expect(404);
  });
});
