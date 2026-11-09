import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { createApp, prisma, resetDb, signup } from './helpers';

describe('광고·제휴 (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const base = { advertiserName: 'A', description: '설명입니다', detail: ['d'], ctaText: '신청', targetFields: ['all'], topics: ['주제1', '주제2'], isDemo: true, collectsContact: false };
  let op: Awaited<ReturnType<typeof signup>>;
  beforeAll(async () => {
    await resetDb(); app = await createApp();
    await prisma.adCampaign.createMany({ data: [
      { ...base, id: 'c-hr', category: 'HR', title: '채용', cpaPrice: 20000, status: 'ACTIVE' },
      { ...base, id: 'c-ins', category: 'INSURANCE', title: '보험', cpaPrice: 30000, status: 'ACTIVE' },
      { ...base, id: 'c-aca', category: 'ACADEMY', title: '교육', cpaPrice: 15000, status: 'ACTIVE', targetFields: ['beauty'] },
      { ...base, id: 'c-paused', category: 'ETC', title: '중지', cpaPrice: 1000, status: 'PAUSED' },
    ] });
    op = await signup(app, { role: 'OPERATOR' });
  });
  afterAll(async () => { await app.close(); await prisma.$disconnect(); });

  it('피드: 활성 광고만 보험→교육→채용 순, 분야 타깃, 4장마다 1개, 예시 광고 고지', async () => {
    const f = (await http().get('/api/v1/ads/feed').expect(200)).body;
    expect(f.every).toBe(4);
    expect(f.campaigns.map((c: any) => c.id)).toEqual(['c-ins', 'c-aca', 'c-hr']);
    expect(f.campaigns[0].disclosure).toContain('예시 광고');
    expect((await http().get('/api/v1/ads/feed?field=biz').expect(200)).body.campaigns.map((c: any) => c.id)).toEqual(['c-ins', 'c-hr']);
    await http().get('/api/v1/ads/c-paused').expect(404);
  });

  it('이벤트: 노출·폼 시작은 세션·위치당 1회, 클릭은 모두 기록(고유 클릭 별도), 중지 광고 무시', async () => {
    const ev = (eventType: string, sessionId = 'sess-0001', placement = 'feed-0') => http().post('/api/v1/ads/events').send({ campaignId: 'c-ins', eventType, sessionId, placement }).expect(201);
    expect((await ev('IMPRESSION')).body.recorded).toBe(true);
    expect((await ev('IMPRESSION')).body.recorded).toBe(false);
    await ev('IMPRESSION', 'sess-0001', 'feed-1'); await ev('IMPRESSION', 'sess-0002');
    await ev('CLICK'); await ev('CLICK'); await ev('CLICK', 'sess-0002');
    await ev('FORM_START'); await ev('FORM_START');
    expect((await http().post('/api/v1/ads/events').send({ campaignId: 'c-paused', eventType: 'IMPRESSION', sessionId: 'sess-0001', placement: 'x' }).expect(201)).body.recorded).toBe(false);
    await http().post('/api/v1/ads/events').send({ campaignId: 'c-ins', eventType: 'SUBMIT', sessionId: 'sess-0001', placement: 'x' }).expect(400);
    const m = (await http().get('/api/v1/admin/ads/campaigns').set(op.auth).expect(200)).body.items.find((c: any) => c.id === 'c-ins').metrics;
    expect(m).toMatchObject({ impressions: 3, clicks: 3, uniqueClicks: 2, formStarts: 1, ctr: 66.7 });
  });

  it('신청: 로그인·동의·주제 필수, 예시 광고는 연락처 거부, 재신청은 중복 → 승인 불가', async () => {
    const u = await signup(app);
    const lead = { answers: { topic: '주제1' }, consentPrivacy: true, consentThirdParty: false, sessionId: 'sess-0001', placement: 'detail' };
    await http().post('/api/v1/ads/c-ins/leads').send(lead).expect(401);
    expect((await http().post('/api/v1/ads/c-ins/leads').set(u.auth).send({ ...lead, consentPrivacy: false }).expect(400)).body.code).toBe('CONSENT_REQUIRED');
    expect((await http().post('/api/v1/ads/c-ins/leads').set(u.auth).send({ ...lead, answers: { topic: '없는 주제' } }).expect(400)).body.code).toBe('INVALID_TOPIC');
    expect((await http().post('/api/v1/ads/c-ins/leads').set(u.auth).send({ ...lead, name: '홍길동', phone: '010-1234-5678' }).expect(400)).body.code).toBe('CONTACT_NOT_ALLOWED');
    const first = (await http().post('/api/v1/ads/c-ins/leads').set(u.auth).send(lead).expect(201)).body;
    expect(first).toMatchObject({ duplicate: false });
    expect(first.message).toContain('예시 광고');
    const dup = (await http().post('/api/v1/ads/c-ins/leads').set(u.auth).send(lead).expect(201)).body;
    expect(dup.duplicate).toBe(true);
    expect((await http().post(`/api/v1/admin/ads/leads/${dup.id}/decide`).set(op.auth).send({ action: 'APPROVE' }).expect(409)).body.code).toBe('DUPLICATE_LEAD');

    // 승인 → 단가 스냅샷 매출, 재승인 409, 단가 변경 후에도 기존 매출 유지, 승인 취소 → REVERSAL
    await http().post(`/api/v1/admin/ads/leads/${first.id}/decide`).set(op.auth).send({ action: 'APPROVE' }).expect(201);
    await http().post(`/api/v1/admin/ads/leads/${first.id}/decide`).set(op.auth).send({ action: 'APPROVE' }).expect(409);
    await http().patch('/api/v1/admin/ads/campaigns/c-ins/price').set(op.auth).send({ cpaPrice: 1 }).expect(403);
    const sa = await signup(app, { role: 'SUPER_ADMIN' });
    await http().patch('/api/v1/admin/ads/campaigns/c-ins/price').set(sa.auth).send({ cpaPrice: 50000 }).expect(200);
    let list = (await http().get('/api/v1/admin/ads/campaigns').set(op.auth).expect(200)).body;
    expect(list.items.find((c: any) => c.id === 'c-ins').metrics).toMatchObject({ approved: 1, duplicates: 1, revenue: 30000, submits: 2 });
    await http().post(`/api/v1/admin/ads/leads/${first.id}/decide`).set(op.auth).send({ action: 'REVERSE' }).expect(400);
    await http().post(`/api/v1/admin/ads/leads/${first.id}/decide`).set(op.auth).send({ action: 'REVERSE', note: '허위 신청' }).expect(201);
    list = (await http().get('/api/v1/admin/ads/campaigns').set(op.auth).expect(200)).body;
    expect(list.items.find((c: any) => c.id === 'c-ins').metrics.revenue).toBe(0);
    expect(await prisma.adRevenueEntry.count({ where: { leadId: first.id } })).toBe(2);
    expect(await prisma.adminAuditLog.count({ where: { action: { startsWith: 'AD_LEAD_' }, targetId: first.id } })).toBe(2);
    const other = await signup(app);
    const l3 = (await http().post('/api/v1/ads/c-hr/leads').set(other.auth).send(lead).expect(201)).body;
    await http().post(`/api/v1/admin/ads/leads/${l3.id}/decide`).set(op.auth).send({ action: 'REJECT' }).expect(400);
    await http().post(`/api/v1/admin/ads/leads/${l3.id}/decide`).set(op.auth).send({ action: 'REJECT', note: '대상 아님' }).expect(201);
    await http().post('/api/v1/admin/ads/leads/x/decide').set(u.auth).send({ action: 'APPROVE' }).expect(403);
  });

  it('캠페인 심사: 등록은 심사 대기, 반려 사유 필수, 연락처 수집 광고는 승인 플래그 전 활성화 403', async () => {
    const dto = { category: 'ACADEMY', advertiserName: '실광고주', title: '실제 교육 상담', description: '설명입니다', detail: ['a'], ctaText: '상담 신청', cpaPrice: 10000, targetFields: ['all'], topics: ['온라인'], collectsContact: true };
    const c = (await http().post('/api/v1/admin/ads/campaigns').set(op.auth).send(dto).expect(201)).body;
    expect(c.status).toBe('PENDING_REVIEW');
    expect((await http().get('/api/v1/ads/feed').expect(200)).body.campaigns.map((x: any) => x.id)).not.toContain(c.id);
    expect((await http().patch(`/api/v1/admin/ads/campaigns/${c.id}/status`).set(op.auth).send({ status: 'ACTIVE' }).expect(403)).body.code).toBe('CONTACT_COLLECTION_DISABLED');
    await http().patch(`/api/v1/admin/ads/campaigns/${c.id}/status`).set(op.auth).send({ status: 'REJECTED' }).expect(400);
    await http().patch(`/api/v1/admin/ads/campaigns/${c.id}/status`).set(op.auth).send({ status: 'REJECTED', note: '개인정보 제공 승인 전' }).expect(200);
    const c2 = (await http().post('/api/v1/admin/ads/campaigns').set(op.auth).send({ ...dto, collectsContact: false }).expect(201)).body;
    await http().patch(`/api/v1/admin/ads/campaigns/${c2.id}/status`).set(op.auth).send({ status: 'ACTIVE' }).expect(200);
    await http().patch(`/api/v1/admin/ads/campaigns/${c2.id}/status`).set(op.auth).send({ status: 'PENDING_REVIEW' }).expect(409);
    const body = (await http().get('/api/v1/admin/ads/campaigns').set(op.auth).expect(200)).body;
    expect(body).toMatchObject({ contactCollection: 'DISABLED_PENDING_APPROVAL', leadDelivery: 'NOT_IMPLEMENTED' });
    // 관리 화면 신청 목록에 연락처 원문·암호문 없음
    const leads = (await http().get('/api/v1/admin/ads/leads').set(op.auth).expect(200)).body;
    expect(leads.every((l: any) => l.nameEnc === undefined && l.phoneEnc === undefined)).toBe(true);
  });

  it('(승인 플래그 켠 환경) 연락처 수집 광고: 제3자 제공 동의·번호 형식 필수, 이름·번호는 암호화 저장·관리 화면은 마스킹', async () => {
    const cfg = app.get(ConfigService);
    const orig = cfg.get.bind(cfg);
    const spy = jest.spyOn(cfg, 'get').mockImplementation(((k: string) => (k === 'AD_CONTACT_COLLECTION' ? true : orig(k))) as typeof cfg.get);
    try {
      const app2 = app;
      const h = () => request(app2.getHttpServer());
      const op2 = op;
      const c = (await h().post('/api/v1/admin/ads/campaigns').set(op2.auth).send({ category: 'HR', advertiserName: '실광고주', title: '실제 채용 상담', description: '설명입니다', detail: [], ctaText: '신청', cpaPrice: 10000, targetFields: ['all'], topics: ['사무'], collectsContact: true }).expect(201)).body;
      await h().patch(`/api/v1/admin/ads/campaigns/${c.id}/status`).set(op2.auth).send({ status: 'ACTIVE' }).expect(200);
      const u = await signup(app2);
      const lead = { answers: { topic: '사무' }, consentPrivacy: true, consentThirdParty: true, sessionId: 'sess-0009', placement: 'detail', name: '홍길동', phone: '010-1234-5678' };
      expect((await h().post(`/api/v1/ads/${c.id}/leads`).set(u.auth).send({ ...lead, consentThirdParty: false }).expect(400)).body.code).toBe('CONSENT_REQUIRED');
      expect((await h().post(`/api/v1/ads/${c.id}/leads`).set(u.auth).send({ ...lead, phone: '02-123-4567' }).expect(400)).body.code).toBe('INVALID_PHONE');
      const r = (await h().post(`/api/v1/ads/${c.id}/leads`).set(u.auth).send(lead).expect(201)).body;
      const row = await prisma.adLead.findUniqueOrThrow({ where: { id: r.id } });
      expect(row.phoneEnc).not.toContain('5678'); expect(row.nameEnc).not.toContain('홍길동'); expect(row.phoneLast4).toBe('5678');
      const listed = (await h().get(`/api/v1/admin/ads/leads?campaignId=${c.id}`).set(op2.auth).expect(200)).body[0];
      expect(listed).toMatchObject({ hasContact: true, phone: '010-****-5678' });
      expect(JSON.stringify(listed)).not.toContain('홍길동');
    } finally { spy.mockRestore(); }
  });
});
