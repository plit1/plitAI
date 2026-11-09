import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, prisma, resetDb, signup } from './helpers';

describe('시험 일정 관리 (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => { await resetDb(); app = await createApp(); });
  afterAll(async () => { await app.close(); await prisma.$disconnect(); });

  const CSV = [
    'certId,label,applyStart,applyEnd,examDate,resultDate',
    'industrial-safety,2027년 1회,2027-01-10,2027-01-15,2027-02-20,2027-03-12',
    'industrial-safety,2027년 2회,2027-04-01,2027-04-05,2027-05-10,',
  ].join('\n');

  it('CSV 미리보기(dryRun) → 반영 → 재업로드는 수정으로 집계, 감사 로그', async () => {
    const op = await signup(app, { role: 'OPERATOR' });
    const dry = await http().post('/api/v1/admin/exam-rounds/import').set(op.auth).send({ csv: CSV }).expect(200);
    expect(dry.body).toMatchObject({ create: 2, update: 0, applied: false });
    expect(await prisma.examRound.count()).toBe(0);
    const ok = await http().post('/api/v1/admin/exam-rounds/import').set(op.auth).send({ csv: CSV, dryRun: false }).expect(200);
    expect(ok.body).toMatchObject({ create: 2, applied: true });
    const again = await http().post('/api/v1/admin/exam-rounds/import').set(op.auth).send({ csv: CSV, dryRun: false }).expect(200);
    expect(again.body).toMatchObject({ create: 0, update: 2, applied: true });
    expect(await prisma.examRound.count()).toBe(2);
    expect(await prisma.adminAuditLog.count({ where: { action: 'EXAM_ROUND_IMPORT' } })).toBe(2);

    // KST 날짜로 저장 → 공개 API 로 조회
    const pub = await http().get('/api/v1/certifications/industrial-safety/exam-rounds').expect(200);
    expect(pub.body[0]).toMatchObject({ label: '2027년 1회', source: 'CSV', examDate: '2027-02-19T15:00:00.000Z' });
  });

  it('오류 행이 하나라도 있으면 전체 반영 거부 (부분 반영 없음)', async () => {
    const op = await signup(app, { role: 'OPERATOR' });
    const bad = CSV.replace('2027년 2회,2027-04-01', '2027년 9회,2027-06-01') + '\nnope,1회,,,2027-01-01,';
    const r = await http().post('/api/v1/admin/exam-rounds/import').set(op.auth).send({ csv: bad, dryRun: false }).expect(200);
    expect(r.body.applied).toBe(false);
    expect(r.body.errors.map((e: any) => e.line)).toEqual([3, 4]);
    expect(await prisma.examRound.count({ where: { label: '2027년 9회' } })).toBe(0);
  });

  it('직접 입력·삭제 + 검증 + 권한, 공공 API provider 는 미연동 상태 표시', async () => {
    const op = await signup(app, { role: 'OPERATOR' });
    const u = await signup(app);
    await http().post('/api/v1/admin/exam-rounds').set(u.auth).send({ certId: 'industrial-safety', label: 'X', examDate: '2027-09-01' }).expect(403);
    const bad = await http().post('/api/v1/admin/exam-rounds').set(op.auth).send({ certId: 'industrial-safety', label: '3회', applyEnd: '2027-09-10', examDate: '2027-09-01' }).expect(400);
    expect(bad.body.code).toBe('INVALID_EXAM_ROUND');
    const row = await http().post('/api/v1/admin/exam-rounds').set(op.auth).send({ certId: 'industrial-safety', label: '3회', examDate: '2027-09-01' }).expect(201);
    expect(row.body.source).toBe('MANUAL');
    await http().delete(`/api/v1/admin/exam-rounds/${row.body.id}`).set(op.auth).expect(204);
    const prov = await http().get('/api/v1/admin/exam-rounds/providers').set(op.auth).expect(200);
    expect(prov.body.find((p: any) => p.id === 'QNET_API').status).toBe('NOT_CONFIGURED');
  });

  it('기본 본문 제한(100KB)을 넘는 약 250KB CSV 도 처리', async () => {
    const op = await signup(app, { role: 'OPERATOR' });
    const rows = Array.from({ length: 7000 }, (_, i) => `industrial-safety,bulk-${i},,,2027-10-01,`);
    const csv = ['certId,label,applyStart,applyEnd,examDate,resultDate', ...rows].join('\n');
    expect(csv.length).toBeGreaterThan(200_000);
    const r = await http().post('/api/v1/admin/exam-rounds/import').set(op.auth).send({ csv }).expect(200);
    expect(r.body).toMatchObject({ create: 7000, applied: false });
  });
});
