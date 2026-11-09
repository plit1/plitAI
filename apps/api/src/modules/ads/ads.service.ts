import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdCampaign, AdCampaignStatus, Prisma } from '@prisma/client';
import { AppError, Conflict, Forbidden, NotFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { sealSecret } from '../../common/totp';
import { AuditService } from '../admin/audit.service';
import { AD_CATEGORY, AD_CONSENT_VERSION, AD_POLICY, DEDUPE_EVENTS, maskPhone, metrics, PHONE_RE, sortCampaigns } from './ads.rules';

export interface LeadInput { answers: { topic: string; certId?: string }; name?: string; phone?: string; consentPrivacy: boolean; consentThirdParty: boolean; sessionId: string; placement: string }
export interface CampaignInput { category: string; advertiserName: string; title: string; description: string; detail: string[]; ctaText: string; cpaPrice: number; targetFields: string[]; topics: string[]; collectsContact: boolean }

@Injectable()
export class AdsService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly audit: AuditService) {}

  private get contactAllowed() { return this.config.get('AD_CONTACT_COLLECTION') === true; }

  private publicView(c: AdCampaign) {
    return {
      id: c.id, category: c.category, categoryLabel: AD_CATEGORY[c.category] ?? c.category, advertiserName: c.advertiserName, title: c.title, description: c.description,
      detail: c.detail, ctaText: c.ctaText, topics: c.topics, collectsContact: c.collectsContact, isDemo: c.isDemo,
      disclosure: c.isDemo ? '예시 광고예요. 실제 광고주가 아니며 신청 내용은 어디에도 전달되지 않아요.' : '광고 · 신청 시 광고주에게 상담 연락이 갈 수 있어요.',
    };
  }

  /** 노출용 활성 광고: 분야 타깃 일치("all" 포함), 보험→교육→채용 순. 화면은 카드 every 장마다 1개 삽입 */
  async feed(field?: string) {
    const rows = await this.prisma.adCampaign.findMany({ where: { status: 'ACTIVE', ...(field ? { targetFields: { hasSome: [field, 'all'] } } : {}) } });
    return { every: AD_POLICY.every, campaigns: sortCampaigns(rows).map((c) => this.publicView(c)) };
  }

  async campaign(id: string) {
    const c = await this.prisma.adCampaign.findUnique({ where: { id } });
    if (!c || c.status !== 'ACTIVE') throw NotFound('광고');
    return this.publicView(c);
  }

  /** 이벤트 수집: 노출·폼 시작은 캠페인+세션+위치당 1회 (dedupeKey 유니크) */
  async event(input: { campaignId: string; eventType: string; sessionId: string; placement: string }, userId?: string) {
    const c = await this.prisma.adCampaign.findUnique({ where: { id: input.campaignId }, select: { status: true } });
    if (!c || c.status !== 'ACTIVE') return { recorded: false };
    const dedupeKey = DEDUPE_EVENTS.includes(input.eventType) ? `${input.eventType}:${input.campaignId}:${input.sessionId}:${input.placement}` : null;
    const r = await this.prisma.adEvent.createMany({ data: [{ ...input, userId: userId ?? null, dedupeKey }], skipDuplicates: true });
    return { recorded: r.count > 0 };
  }

  /** 상담 신청: 로그인 필수. 같은 회원·같은 캠페인 재신청은 중복 표시(승인 불가). 연락처는 수집 허용 캠페인만, 암호화 저장 */
  async submitLead(userId: string, campaignId: string, input: LeadInput) {
    const c = await this.prisma.adCampaign.findUnique({ where: { id: campaignId } });
    if (!c || c.status !== 'ACTIVE') throw NotFound('광고');
    if (!input.consentPrivacy) throw new AppError('CONSENT_REQUIRED', '개인정보 수집·이용에 동의해야 신청할 수 있어요.');
    if (!c.topics.includes(input.answers.topic)) throw new AppError('INVALID_TOPIC', '상담 주제를 다시 선택해주세요.');
    let contact: { nameEnc: string; phoneEnc: string; phoneLast4: string } | null = null;
    if (c.collectsContact) {
      if (!this.contactAllowed) throw Forbidden('CONTACT_COLLECTION_DISABLED', '지금은 상담 신청을 받지 않아요.');
      if (!input.consentThirdParty) throw new AppError('CONSENT_REQUIRED', '광고주 제3자 제공에 동의해야 신청할 수 있어요.');
      const name = input.name?.trim() ?? '';
      if (name.length < 2 || name.length > 20) throw new AppError('INVALID_NAME', '이름을 확인해주세요.');
      if (!input.phone || !PHONE_RE.test(input.phone)) throw new AppError('INVALID_PHONE', '휴대전화 번호를 확인해주세요.');
      const digits = input.phone.replace(/-/g, '');
      contact = { nameEnc: sealSecret(name), phoneEnc: sealSecret(digits), phoneLast4: digits.slice(-4) };
    } else if (input.name || input.phone) {
      throw new AppError('CONTACT_NOT_ALLOWED', '이 광고는 연락처를 받지 않아요.');
    }
    if (input.answers.certId && !(await this.prisma.certification.findUnique({ where: { id: input.answers.certId } }))) throw new AppError('INVALID_CERT', '자격증을 다시 선택해주세요.');
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ad-lead:${userId}:${campaignId}`}))`;
      const prev = await tx.adLead.findFirst({ where: { userId, campaignId, duplicateOfId: null }, orderBy: { createdAt: 'asc' } });
      const lead = await tx.adLead.create({ data: { campaignId, userId, answers: input.answers as Prisma.InputJsonValue, ...(contact ?? {}), consentVersion: AD_CONSENT_VERSION, duplicateOfId: prev?.id ?? null } });
      await tx.adEvent.create({ data: { campaignId, eventType: 'SUBMIT', sessionId: input.sessionId, placement: input.placement, userId } });
      return { id: lead.id, status: lead.status, duplicate: !!prev, message: c.isDemo ? '예시 광고라 실제 상담 연결은 없어요.' : '신청이 접수됐어요. 확인 후 상담 연락을 드려요.' };
    });
  }

  // ── 관리자 ──
  private async metricsFor(ids: string[]) {
    const [ev, uniq, leads, rev] = await Promise.all([
      this.prisma.adEvent.groupBy({ by: ['campaignId', 'eventType'], where: { campaignId: { in: ids } }, _count: true }),
      this.prisma.$queryRaw<{ campaignId: string; n: bigint }[]>`SELECT "campaignId", COUNT(DISTINCT "sessionId") AS n FROM "AdEvent" WHERE "eventType" = 'CLICK' AND "campaignId" = ANY(${ids}) GROUP BY "campaignId"`,
      this.prisma.adLead.findMany({ where: { campaignId: { in: ids } }, select: { campaignId: true, status: true, duplicateOfId: true } }),
      this.prisma.adRevenueEntry.groupBy({ by: ['campaignId', 'type'], where: { campaignId: { in: ids } }, _sum: { amount: true } }),
    ]);
    const count = (id: string, t: string) => ev.find((e) => e.campaignId === id && e.eventType === t)?._count ?? 0;
    const sum = (id: string, t: string) => rev.find((r) => r.campaignId === id && r.type === t)?._sum.amount ?? 0;
    return new Map(ids.map((id) => [id, metrics({
      impressions: count(id, 'IMPRESSION'), clicks: count(id, 'CLICK'), uniqueClicks: Number(uniq.find((u) => u.campaignId === id)?.n ?? 0), formStarts: count(id, 'FORM_START'),
      leads: leads.filter((l) => l.campaignId === id), revenue: sum(id, 'CREDIT') - sum(id, 'REVERSAL'),
    })]));
  }

  async adminCampaigns() {
    const rows = await this.prisma.adCampaign.findMany({ orderBy: { createdAt: 'desc' } });
    const m = await this.metricsFor(rows.map((r) => r.id));
    const total = [...m.values()].reduce((a, x) => ({ revenue: a.revenue + x.revenue, approved: a.approved + x.approved, pending: a.pending + x.pending }), { revenue: 0, approved: 0, pending: 0 });
    return { items: rows.map((r) => ({ ...r, metrics: m.get(r.id) })), total, contactCollection: this.contactAllowed ? 'ENABLED' : 'DISABLED_PENDING_APPROVAL', leadDelivery: 'NOT_IMPLEMENTED' };
  }

  async adminCreate(adminId: string, dto: CampaignInput, ip?: string) {
    this.validate(dto);
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.adCampaign.create({ data: { ...dto, status: 'PENDING_REVIEW', createdById: adminId } });
      await this.audit.log(tx, { actorId: adminId, action: 'AD_CAMPAIGN_CREATE', targetType: 'AdCampaign', targetId: c.id, after: { title: c.title, cpaPrice: c.cpaPrice, collectsContact: c.collectsContact }, ip });
      return c;
    });
  }

  private validate(dto: Partial<CampaignInput>) {
    if (dto.category !== undefined && !(dto.category in AD_CATEGORY)) throw new AppError('INVALID_CATEGORY', '광고 분류를 확인해주세요.');
    if (dto.cpaPrice !== undefined && (!Number.isInteger(dto.cpaPrice) || dto.cpaPrice < 0 || dto.cpaPrice > 10_000_000)) throw new AppError('INVALID_PRICE', '0~10,000,000원 사이로 입력해주세요.');
    if (dto.topics !== undefined && (!dto.topics.length || dto.topics.length > 10)) throw new AppError('INVALID_TOPICS', '상담 주제를 1~10개 입력해주세요.');
  }

  /** 상태 전환: 심사 승인(ACTIVE)·반려(사유 필수)·일시중지·재개·종료. 연락처 수집 캠페인 활성화는 승인 플래그 필요 */
  async adminSetStatus(adminId: string, id: string, status: AdCampaignStatus, note: string | undefined, ip?: string) {
    const c = await this.prisma.adCampaign.findUnique({ where: { id } });
    if (!c) throw NotFound('광고');
    const allowed: Record<string, AdCampaignStatus[]> = { PENDING_REVIEW: ['ACTIVE', 'REJECTED'], ACTIVE: ['PAUSED', 'ENDED'], PAUSED: ['ACTIVE', 'ENDED'], REJECTED: ['PENDING_REVIEW'], ENDED: [] };
    if (!allowed[c.status].includes(status)) throw Conflict('INVALID_TRANSITION', `${c.status} 상태에서는 할 수 없는 처리예요.`);
    if (status === 'REJECTED' && !note?.trim()) throw new AppError('NOTE_REQUIRED', '반려 사유를 입력해주세요.');
    if (status === 'ACTIVE' && c.collectsContact && !this.contactAllowed) throw Forbidden('CONTACT_COLLECTION_DISABLED', '연락처 수집 광고는 개인정보 제3자 제공 승인(AD_CONTACT_COLLECTION) 후 활성화할 수 있어요.');
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.adCampaign.update({ where: { id }, data: { status, reviewNote: note ?? c.reviewNote } });
      await this.audit.log(tx, { actorId: adminId, action: 'AD_CAMPAIGN_STATUS', targetType: 'AdCampaign', targetId: id, before: { status: c.status }, after: { status, note }, ip });
      return r;
    });
  }

  /** 단가 변경: 이후 승인분부터 적용 (승인 시점 단가 스냅샷) */
  async adminSetPrice(adminId: string, id: string, cpaPrice: number, ip?: string) {
    this.validate({ cpaPrice });
    const c = await this.prisma.adCampaign.findUnique({ where: { id } });
    if (!c) throw NotFound('광고');
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.adCampaign.update({ where: { id }, data: { cpaPrice } });
      await this.audit.log(tx, { actorId: adminId, action: 'AD_PRICE_UPDATE', targetType: 'AdCampaign', targetId: id, before: { cpaPrice: c.cpaPrice }, after: { cpaPrice }, ip });
      return r;
    });
  }

  async adminLeads(campaignId?: string, status?: string) {
    const rows = await this.prisma.adLead.findMany({ where: { ...(campaignId ? { campaignId } : {}), ...(status ? { status: status as 'PENDING' } : {}) }, include: { campaign: { select: { title: true, advertiserName: true } } }, orderBy: { createdAt: 'desc' }, take: 300 });
    // 연락처 원문은 관리 화면에도 내보내지 않음 (광고주 전달 기능 승인 전)
    return rows.map(({ nameEnc, phoneEnc, ...l }) => ({ ...l, hasContact: !!(nameEnc && phoneEnc), phone: maskPhone(l.phoneLast4) }));
  }

  /** 유효 DB 승인 → 매출 CREDIT (단가 스냅샷). 중복·처리 완료 건 불가. */
  async adminDecideLead(adminId: string, leadId: string, action: 'APPROVE' | 'REJECT' | 'REVERSE', note: string | undefined, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "AdLead" WHERE id = ${leadId} FOR UPDATE`;
      if (!row) throw NotFound('신청');
      const l = await tx.adLead.findUniqueOrThrow({ where: { id: leadId }, include: { campaign: true } });
      const now = new Date();
      if (action === 'APPROVE') {
        if (l.duplicateOfId) throw Conflict('DUPLICATE_LEAD', '중복 신청은 승인할 수 없어요.');
        if (l.status !== 'PENDING') throw Conflict('ALREADY_DECIDED', l.status === 'APPROVED' ? '이미 승인된 신청이에요. 매출은 다시 생기지 않아요.' : '대기 중인 신청만 승인할 수 있어요.');
        const price = l.campaign.cpaPrice;
        await tx.adRevenueEntry.create({ data: { leadId, campaignId: l.campaignId, type: 'CREDIT', amount: price, dedupeKey: `CREDIT:${leadId}`, createdById: adminId } });
        await tx.adLead.update({ where: { id: leadId }, data: { status: 'APPROVED', priceSnapshot: price, decidedById: adminId, decidedAt: now } });
      } else if (action === 'REJECT') {
        if (l.status !== 'PENDING') throw Conflict('ALREADY_DECIDED', '대기 중인 신청만 거절할 수 있어요.');
        if (!note?.trim()) throw new AppError('NOTE_REQUIRED', '거절 사유를 입력해주세요.');
        await tx.adLead.update({ where: { id: leadId }, data: { status: 'REJECTED', rejectReason: note.trim(), decidedById: adminId, decidedAt: now } });
      } else {
        if (l.status !== 'APPROVED') throw Conflict('NOT_APPROVED', '승인된 신청만 취소할 수 있어요.');
        if (!note?.trim()) throw new AppError('NOTE_REQUIRED', '승인 취소 사유를 입력해주세요.');
        await tx.adRevenueEntry.create({ data: { leadId, campaignId: l.campaignId, type: 'REVERSAL', amount: l.priceSnapshot ?? 0, dedupeKey: `REVERSAL:${leadId}`, createdById: adminId } });
        await tx.adLead.update({ where: { id: leadId }, data: { status: 'REVERSED', rejectReason: note.trim(), decidedById: adminId, decidedAt: now } });
      }
      await this.audit.log(tx, { actorId: adminId, action: `AD_LEAD_${action}`, targetType: 'AdLead', targetId: leadId, before: { status: l.status }, after: { note, price: action === 'APPROVE' ? l.campaign.cpaPrice : l.priceSnapshot }, ip });
      return { id: leadId, status: action === 'APPROVE' ? 'APPROVED' : action === 'REJECT' ? 'REJECTED' : 'REVERSED' };
    });
  }
}
