import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, prisma, resetDb, signup } from './helpers';

const DAY = 86400000;
const day = (n: number) => new Date(Date.now() + n * DAY);

describe('창업하기 (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  let nailGyeonggi: string, allNation: string, cafeBusan: string, expired: string;
  beforeAll(async () => {
    await resetDb(); app = await createApp();
    await prisma.certification.create({ data: { id: 'nail', name: '미용사(네일)', field: 'beauty', qualType: '국가기술', challengeType: 'exam', issuer: 'x', difficulty: 3, tagline: 't', passRule: 'p', subjects: ['a'] } });
    await prisma.challengeOffering.create({ data: { id: 'nail-open', certId: 'nail', round: '1회', recruitEnd: day(5), examDate: day(60), durationDays: 56 } });
    const base = { provider: 'DEMO', agency: '데모기관', eligibility: '예비창업자', summary: '요약', isDemo: true, sigungu: null, applyStart: day(-5) };
    nailGyeonggi = (await prisma.startupProgram.create({ data: { ...base, externalId: 'p1', title: '경기 뷰티 창업 지원', region: '경기', targetStages: ['PREP'], industries: ['NAIL', 'HAIR'], supportType: 'GRANT', applyEnd: day(20) } })).id;
    allNation = (await prisma.startupProgram.create({ data: { ...base, externalId: 'p2', title: '전국 창업 교육', region: '전국', targetStages: ['INTEREST', 'PREP'], industries: ['ALL'], supportType: 'EDU', applyEnd: day(2) } })).id;
    cafeBusan = (await prisma.startupProgram.create({ data: { ...base, externalId: 'p3', title: '부산 카페 융자', region: '부산', targetStages: ['OPEN'], industries: ['CAFE'], supportType: 'LOAN', applyEnd: day(30) } })).id;
    expired = (await prisma.startupProgram.create({ data: { ...base, externalId: 'p4', title: '마감된 공고', region: '전국', targetStages: ['PREP'], industries: ['ALL'], supportType: 'GRANT', applyEnd: day(-1) } })).id;
  });
  afterAll(async () => { await app.close(); await prisma.$disconnect(); });

  it('공개 기준 정보: 업종 5·로드맵 6·신용보증재단 17·파트너는 예시 표시, 면책 문구', async () => {
    const m = (await http().get('/api/v1/startup/meta').expect(200)).body;
    expect(m.industries).toHaveLength(5);
    expect(m.roadmap).toHaveLength(6);
    expect(m.funds).toHaveLength(17);
    expect(m.partners.every((p: any) => p.isDemo)).toBe(true);
    expect(m.notice).toContain('원문 공고');
  });

  it('비회원 검색: 마감 제외, 지역(전국 포함)·업종(ALL 포함)·유형 필터, 맞춤도 없음', async () => {
    const all = (await http().get('/api/v1/startup/programs').expect(200)).body;
    expect(all.items.map((p: any) => p.id)).not.toContain(expired);
    expect(all.items[0].match).toBeUndefined();
    expect(all.items.find((p: any) => p.id === allNation).life).toBe('CLOSING_SOON');
    expect((await http().get(`/api/v1/startup/programs?region=${encodeURIComponent('경기')}`).expect(200)).body.items.map((p: any) => p.id).sort()).toEqual([nailGyeonggi, allNation].sort());
    expect((await http().get('/api/v1/startup/programs?industry=CAFE').expect(200)).body.items.map((p: any) => p.id).sort()).toEqual([allNation, cafeBusan].sort());
    expect((await http().get('/api/v1/startup/programs?type=LOAN').expect(200)).body.items.map((p: any) => p.id)).toEqual([cafeBusan]);
    const d = (await http().get(`/api/v1/startup/programs/${nailGyeonggi}`).expect(200)).body;
    expect(d.notice).toContain('가상');
  });

  it('챌린지 자격증 → 추천 업종(네일) → 프로필 저장 → 맞춤도 순 정렬, 신용보증재단 안내', async () => {
    const u = await signup(app);
    await http().post('/api/v1/challenges/nail-open/join').set(u.auth).send({ plan: 'FREE' }).expect(201);
    let p = (await http().get('/api/v1/me/startup-profile').set(u.auth).expect(200)).body;
    expect(p.suggestion).toMatchObject({ certId: 'nail', industry: 'NAIL', status: 'PREPARING' });
    expect(p.effectiveIndustry).toBe('NAIL');
    expect(p.progress).toEqual({ done: 0, total: 6 });
    expect((await http().put('/api/v1/me/startup-profile').set(u.auth).send({ industry: 'PIZZA', sido: '경기', sigungu: '', stage: 'PREP', budget: '' }).expect(400)).body.code).toBe('INVALID_INDUSTRY');
    p = (await http().put('/api/v1/me/startup-profile').set(u.auth).send({ industry: null, sido: '경기', sigungu: '수원시', stage: 'PREP', budget: '3천만 원 미만' }).expect(200)).body;
    expect(p.fund.name).toContain('경기');
    expect(p.industryChecks.length).toBe(4);
    const r = (await http().get('/api/v1/startup/programs?sort=match').set(u.auth).expect(200)).body;
    expect(r.items[0].id).toBe(nailGyeonggi);
    expect(r.items[0].match).toMatchObject({ score: 58, level: 'HIGH' });
    expect(r.items.find((x: any) => x.id === cafeBusan).match.level).toBe('LOW');
  });

  it('로드맵 체크·해제, 관심 공고 저장', async () => {
    const u = await signup(app);
    let p = (await http().put('/api/v1/me/startup-profile/roadmap/permit').set(u.auth).send({ done: true }).expect(200)).body;
    p = (await http().put('/api/v1/me/startup-profile/roadmap/fund').set(u.auth).send({ done: true }).expect(200)).body;
    expect(p.progress.done).toBe(2);
    p = (await http().put('/api/v1/me/startup-profile/roadmap/permit').set(u.auth).send({ done: false }).expect(200)).body;
    expect(p.roadmap.filter((t: any) => t.done).map((t: any) => t.id)).toEqual(['fund']);
    await http().put('/api/v1/me/startup-profile/roadmap/nope').set(u.auth).send({ done: true }).expect(404);
    await http().put(`/api/v1/startup/programs/${allNation}/save`).set(u.auth).expect(200);
    expect((await http().get('/api/v1/me/startup/saved').set(u.auth).expect(200)).body.map((x: any) => x.id)).toEqual([allNation]);
    expect((await http().get(`/api/v1/startup/programs/${allNation}`).set(u.auth).expect(200)).body.saved).toBe(true);
    await http().delete(`/api/v1/startup/programs/${allNation}/save`).set(u.auth).expect(200);
    expect((await http().get('/api/v1/me/startup/saved').set(u.auth).expect(200)).body).toHaveLength(0);
    await http().get('/api/v1/me/startup-profile').expect(401);
  });

  it('관리자: 공고 등록(원문 https 필수)·숨김, 자격증→업종 맵 수정, 공급자 상태, 감사 로그, 일반 사용자 차단', async () => {
    const op = await signup(app, { role: 'OPERATOR' });
    const user = await signup(app);
    const dto = { title: '실제 지원사업', agency: '경기신용보증재단', region: '경기', targetStages: ['PREP'], industries: ['NAIL'], supportType: 'GUARANTEE', applyEnd: day(10).toISOString(), eligibility: '경기 소재 예비창업자', summary: '보증 지원' };
    await http().post('/api/v1/admin/startup/programs').set(user.auth).send({ ...dto, sourceUrl: 'https://x.kr' }).expect(403);
    expect((await http().post('/api/v1/admin/startup/programs').set(op.auth).send({ ...dto, sourceUrl: 'http://x.kr' }).expect(400)).body.code).toBe('SOURCE_URL_REQUIRED');
    expect((await http().post('/api/v1/admin/startup/programs').set(op.auth).send({ ...dto, region: '마포', sourceUrl: 'https://x.kr' }).expect(400)).body.code).toBe('INVALID_REGION');
    expect((await http().post('/api/v1/admin/startup/programs').set(op.auth).send({ ...dto, applyStart: day(20).toISOString(), sourceUrl: 'https://x.kr' }).expect(400)).body.code).toBe('INVALID_PERIOD');
    const p = (await http().post('/api/v1/admin/startup/programs').set(op.auth).send({ ...dto, sourceUrl: 'https://x.kr/1' }).expect(201)).body;
    expect(p.provider).toBe('ADMIN');
    await http().patch(`/api/v1/admin/startup/programs/${p.id}`).set(op.auth).send({ status: 'HIDDEN' }).expect(200);
    await http().get(`/api/v1/startup/programs/${p.id}`).expect(404);
    expect((await http().get('/api/v1/admin/startup/industry-map').set(op.auth).expect(200)).body).toEqual([expect.objectContaining({ certId: 'nail', industry: 'NAIL', overridden: false })]);
    await http().put('/api/v1/admin/startup/industry-map/nail').set(op.auth).send({ industry: 'SKIN', reason: '운영 판단' }).expect(200);
    const u = await signup(app);
    await http().put('/api/v1/me/cert-claims/nail').set(u.auth).expect(200);
    expect((await http().get('/api/v1/me/startup-profile').set(u.auth).expect(200)).body.suggestion.industry).toBe('SKIN');
    await http().put('/api/v1/admin/startup/industry-map/nail').set(op.auth).send({ industry: null }).expect(200);
    expect((await http().get('/api/v1/me/startup-profile').set(u.auth).expect(200)).body.suggestion.industry).toBe('NAIL');
    const prov = (await http().get('/api/v1/admin/startup/providers').set(op.auth).expect(200)).body;
    expect(prov.find((x: any) => x.id === 'KSTARTUP').status).toBe('NOT_CONFIGURED');
    const actions = (await prisma.adminAuditLog.findMany({ where: { actorId: op.id } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['PROGRAM_CREATE', 'PROGRAM_STATUS', 'STARTUP_MAP_UPDATE']));
  });
});
