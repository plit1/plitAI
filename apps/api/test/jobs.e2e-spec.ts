import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, prisma, resetDb, signup } from './helpers';

const DAY = 86400000;

describe('취업하기 (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  let elecJob: string, closedJob: string, cookJob: string;
  beforeAll(async () => {
    await resetDb(); app = await createApp();
    await prisma.certification.create({ data: { id: 'electric', name: '전기기사', field: 'biz', qualType: '국가기술', challengeType: 'exam', issuer: 'x', difficulty: 5, tagline: 't', passRule: 'p', subjects: ['a'] } });
    const base = { provider: 'DEMO', description: '설명입니다', employmentType: '정규직', experience: 'ANY', preferredCerts: [], postedAt: new Date(), isDemo: true };
    elecJob = (await prisma.jobPosting.create({ data: { ...base, providerJobId: 'd1', companyName: '가온전력', title: '전기안전관리자 신입', workLocation: '경기 화성', region: '경기', requiredCerts: ['electric'], categories: ['전기안전관리'], expiresAt: new Date(Date.now() + 10 * DAY) } })).id;
    closedJob = (await prisma.jobPosting.create({ data: { ...base, providerJobId: 'd2', companyName: '마감전력', title: '전기설비 기사', workLocation: '서울 강남', region: '서울', requiredCerts: ['electric'], categories: ['전기설비'], expiresAt: new Date(Date.now() - 2 * DAY) } })).id;
    cookJob = (await prisma.jobPosting.create({ data: { ...base, providerJobId: 'd3', companyName: '맛집', title: '주방 보조', workLocation: '부산 해운대', region: '부산', requiredCerts: [], categories: ['조리'], expiresAt: null } })).id;
    await prisma.jobPosting.create({ data: { ...base, providerJobId: 'd4', companyName: '안전관리', title: '산업안전 담당', workLocation: '경기 수원', region: '경기', requiredCerts: [], preferredCerts: ['industrial-safety'], categories: ['안전관리'], expiresAt: new Date(Date.now() + 2 * DAY) } });
  });
  afterAll(async () => { await app.close(); await prisma.$disconnect(); });

  it('비회원 검색: 마감 공고 기본 제외, 지역·검색어(자격증 이름 포함)·자격증 필터', async () => {
    const all = await http().get('/api/v1/jobs').expect(200);
    expect(all.body.items.map((j: any) => j.id)).not.toContain(closedJob);
    expect(all.body.items[0].match).toBeUndefined();
    expect((await http().get('/api/v1/jobs?includeClosed=true').expect(200)).body.items.map((j: any) => j.id)).toContain(closedJob);
    expect((await http().get('/api/v1/jobs?region=부산').expect(200)).body.items.map((j: any) => j.id)).toEqual([cookJob]);
    expect((await http().get(`/api/v1/jobs?q=${encodeURIComponent('전기기사')}`).expect(200)).body.items.map((j: any) => j.id)).toEqual([elecJob]);
    expect((await http().get('/api/v1/jobs?certId=industrial-safety').expect(200)).body.items[0].life).toBe('CLOSING_SOON');
  });

  it('내 자격증 상태: 준비 중(챌린지) → 본인 신고 → 맞춤도 상승, 맞춤 추천', async () => {
    const u = await signup(app);
    await http().post('/api/v1/challenges/is-open/join').set(u.auth).send({ plan: 'FREE' }).expect(201);
    let prof = (await http().get('/api/v1/me/job-profile').set(u.auth).expect(200)).body;
    expect(prof.certs).toEqual([{ certId: 'industrial-safety', name: '산업안전기사', status: 'PREPARING' }]);
    const r0 = await http().get('/api/v1/jobs?sort=match').set(u.auth).expect(200);
    expect(r0.body.items.find((j: any) => j.id === elecJob).match.level).not.toBe('HIGH');
    const claimed = await http().put('/api/v1/me/cert-claims/electric').set(u.auth).expect(200);
    expect(claimed.body.find((c: any) => c.certId === 'electric').status).toBe('CLAIMED');
    await http().put('/api/v1/me/job-profile').set(u.auth).send({ regions: ['경기'], roles: [], experience: 'NEW', employment: ['정규직'] }).expect(200);
    const d = await http().get(`/api/v1/jobs/${elecJob}`).set(u.auth).expect(200);
    expect(d.body.match).toMatchObject({ level: 'HIGH' });
    expect(d.body.match.reasons.join(' ')).toContain('전기기사 자격증이 필수조건');
    expect(d.body.notice).toContain('가상 공고');
    const rec = await http().get('/api/v1/jobs/recommended').set(u.auth).expect(200);
    expect(rec.body.items[0].id).toBe(elecJob);
    expect(rec.body.items.map((j: any) => j.id)).not.toContain(cookJob);
    await http().put('/api/v1/me/job-profile').set(u.auth).send({ regions: ['화성'], roles: [], experience: null, employment: [] }).expect(400);
    prof = (await http().get('/api/v1/me/job-profile').set(u.auth).expect(200)).body;
    expect(prof.regions).toEqual(['경기']);
  });

  it('관심 공고 저장·해제·목록', async () => {
    const u = await signup(app);
    await http().put(`/api/v1/jobs/${elecJob}/save`).set(u.auth).expect(200);
    await http().put(`/api/v1/jobs/${elecJob}/save`).set(u.auth).expect(200);
    expect((await http().get('/api/v1/me/jobs/saved').set(u.auth).expect(200)).body.map((j: any) => j.id)).toEqual([elecJob]);
    expect((await http().get(`/api/v1/jobs/${elecJob}`).set(u.auth).expect(200)).body.saved).toBe(true);
    await http().delete(`/api/v1/jobs/${elecJob}/save`).set(u.auth).expect(200);
    expect((await http().get('/api/v1/me/jobs/saved').set(u.auth).expect(200)).body).toHaveLength(0);
  });

  it('관리자: 원문 링크 필수 공고 등록·보관·키워드 맵 수정·공급자 상태, 감사 로그', async () => {
    const op = await signup(app, { role: 'OPERATOR' });
    const base = { companyName: '실제회사', title: '시설 전기기술직', description: '전기 설비 유지보수', workLocation: '서울 마포', employmentType: '정규직', experience: 'EXP', requiredCerts: ['electric'], preferredCerts: [], categories: ['시설관리'] };
    expect((await http().post('/api/v1/admin/jobs').set(op.auth).send({ ...base, originalUrl: 'http://x.com' }).expect(400)).body.code).toBe('ORIGINAL_URL_REQUIRED');
    expect((await http().post('/api/v1/admin/jobs').set(op.auth).send({ ...base, workLocation: '마포구', originalUrl: 'https://x.com/1' }).expect(400)).body.code).toBe('INVALID_REGION');
    const j = await http().post('/api/v1/admin/jobs').set(op.auth).send({ ...base, originalUrl: 'https://example.com/job/1' }).expect(201);
    expect(j.body).toMatchObject({ provider: 'ADMIN', region: '서울', isDemo: false });
    await http().patch(`/api/v1/admin/jobs/${j.body.id}`).set(op.auth).send({ status: 'ARCHIVED' }).expect(200);
    await http().get(`/api/v1/jobs/${j.body.id}`).expect(404);
    await http().put('/api/v1/admin/job-map/electric').set(op.auth).send({ keywords: ['주방'] }).expect(200);
    const u = await signup(app);
    await http().put('/api/v1/me/cert-claims/electric').set(u.auth).expect(200);
    const m = (await http().get(`/api/v1/jobs/${cookJob}`).set(u.auth).expect(200)).body.match;
    // 관리자가 바꾼 키워드 '주방' 이 '주방 보조' 제목에 일치 → 관련 직무 +18, 경력무관 +7, 고용형태 +4
    expect(m.score).toBe(18 + 7 + 4);
    expect(m.reasons.join(' ')).toContain('「주방」');
    const prov = await http().get('/api/v1/admin/jobs/providers').set(op.auth).expect(200);
    expect(prov.body.find((p: any) => p.id === 'WORK24').status).toBe('NOT_CONFIGURED');
    expect(await prisma.adminAuditLog.count({ where: { action: { in: ['JOB_CREATE', 'JOB_STATUS', 'JOB_MAP_UPDATE'] } } })).toBe(3);
    await http().get('/api/v1/admin/jobs').set(u.auth).expect(403);
  });
});
