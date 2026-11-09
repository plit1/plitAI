import { Injectable } from '@nestjs/common';
import { Prisma, StartupProgram } from '@prisma/client';
import { AppError, NotFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../admin/audit.service';
import { MyCertsService } from '../jobs/my-certs.service';
import {
  autoIndustry, BUDGETS, CERT_INDUSTRY_DEFAULT, daysLeft, DEMO_PARTNERS, INDUSTRIES, MARKET_SOURCES, matchProgram,
  programLife, ROADMAP, SIDO, SINBO, StartupProfileLike, STAGES, SUPPORT_TYPES,
} from './startup.rules';

export interface ProgramQuery { q?: string; region?: string; industry?: string; stage?: string; type?: string; sort?: 'match' | 'deadline'; includeClosed?: boolean }
const EMPTY: StartupProfileLike = { industry: null, sido: '', sigungu: '', stage: 'INTEREST' };
const INDUSTRY_CODES = INDUSTRIES.map((i) => i.code);

/** 공급자 상태: K-Startup·기업마당은 공공데이터 키·응답 명세 확인 전 호출하지 않음 */
export const STARTUP_PROVIDERS = (env: { KSTARTUP_SERVICE_KEY?: string }) => [
  { id: 'ADMIN', name: 'PLIT 운영 등록 공고', status: 'ACTIVE' },
  { id: 'DEMO', name: 'PLIT 데모 공고 (가상 기관)', status: 'ACTIVE', note: '시연용 가상 공고 — 운영 전 숨김' },
  { id: 'KSTARTUP', name: 'K-Startup 사업공고 (공공데이터포털)', status: env.KSTARTUP_SERVICE_KEY ? 'PENDING_ADAPTER' : 'NOT_CONFIGURED', docs: 'https://www.data.go.kr/data/15125364/openapi.do', note: '서비스키 발급·응답 명세 확인 후 서버 동기화' },
  { id: 'BIZINFO', name: '기업마당 지원사업 정보', status: 'NOT_CONFIGURED', docs: 'https://www.bizinfo.go.kr/web/lay1/program/S1T175C174/apiDetail.do', note: 'API 키 신청 필요' },
];

@Injectable()
export class StartupService {
  constructor(private readonly prisma: PrismaService, private readonly myCerts: MyCertsService, private readonly audit: AuditService) {}

  meta() {
    return {
      industries: INDUSTRIES, stages: STAGES, supportTypes: SUPPORT_TYPES, sido: SIDO, budgets: BUDGETS, roadmap: ROADMAP,
      funds: SIDO.map((s) => ({ sido: s, name: SINBO[s]?.[0], url: SINBO[s]?.[1] })).filter((f) => f.name),
      market: MARKET_SOURCES, partners: DEMO_PARTNERS,
      notice: '지원사업 적합도는 공고 조건과 내 정보를 비교한 참고용 안내예요. 선정 여부와 자격은 반드시 원문 공고에서 확인하세요.',
    };
  }

  private async mapOverrides() {
    return Object.fromEntries((await this.prisma.certIndustryMap.findMany()).map((m) => [m.certId, { industry: m.industry, reason: m.reason }]));
  }

  /** 프로필 + 자격증 기반 추천 업종 (사용자가 고르지 않았으면 추천 업종으로 매칭) */
  private async context(userId?: string) {
    if (!userId) return { profile: EMPTY, industry: null as string | null, suggestion: null, certs: [] as Awaited<ReturnType<MyCertsService['list']>> };
    const [p, certs, ov] = await Promise.all([this.prisma.startupProfile.findUnique({ where: { userId } }), this.myCerts.list(userId), this.mapOverrides()]);
    const suggestion = autoIndustry(certs, ov);
    const profile: StartupProfileLike = p ? { industry: p.industry, sido: p.sido, sigungu: p.sigungu, stage: p.stage } : EMPTY;
    return { profile, industry: profile.industry ?? suggestion?.industry ?? null, suggestion, certs, roadmap: (p?.roadmap ?? {}) as Record<string, boolean>, budget: p?.budget ?? '' };
  }

  private view(p: StartupProgram, now: Date, match?: ReturnType<typeof matchProgram>, saved?: boolean) {
    return {
      id: p.id, provider: p.provider, isDemo: p.isDemo, title: p.title, agency: p.agency, region: p.region, sigungu: p.sigungu,
      targetStages: p.targetStages, industries: p.industries, supportType: p.supportType, supportTypeLabel: SUPPORT_TYPES[p.supportType]?.label ?? p.supportType,
      applyStart: p.applyStart, applyEnd: p.applyEnd, daysLeft: daysLeft(p.applyEnd, now), life: programLife(p, now), sourceUrl: p.sourceUrl, updatedAt: p.updatedAt,
      ...(match ? { match: { score: match.score, level: match.level, reasons: match.reasons } } : {}), ...(saved === undefined ? {} : { saved }),
    };
  }

  async programs(userId: string | undefined, q: ProgramQuery) {
    const now = new Date();
    const where: Prisma.StartupProgramWhereInput = { status: 'ACTIVE' };
    if (q.region) where.region = { in: [q.region, '전국'] };
    if (q.industry) where.industries = { hasSome: [q.industry, 'ALL'] };
    if (q.stage) where.targetStages = { has: q.stage };
    if (q.type) where.supportType = q.type;
    if (q.q) where.OR = [{ title: { contains: q.q, mode: 'insensitive' } }, { agency: { contains: q.q, mode: 'insensitive' } }, { summary: { contains: q.q, mode: 'insensitive' } }];
    const [rows, ctx, saved] = await Promise.all([
      this.prisma.startupProgram.findMany({ where, take: 300, orderBy: { applyEnd: 'asc' } }),
      this.context(userId),
      userId ? this.prisma.savedProgram.findMany({ where: { userId }, select: { programId: true } }) : Promise.resolve([]),
    ]);
    const savedIds = new Set(saved.map((s) => s.programId));
    const items = rows
      .filter((p) => q.includeClosed || programLife(p, now) !== 'EXPIRED')
      .map((p) => this.view(p, now, userId ? matchProgram(p, { industry: ctx.industry, profile: ctx.profile, now }) : undefined, userId ? savedIds.has(p.id) : undefined));
    if (q.sort === 'match' && userId) items.sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0));
    return { items, total: items.length, industry: ctx.industry, notice: this.meta().notice };
  }

  async program(id: string, userId?: string) {
    const p = await this.prisma.startupProgram.findUnique({ where: { id } });
    if (!p || p.status === 'HIDDEN') throw NotFound('지원사업');
    const ctx = await this.context(userId);
    const saved = userId ? !!(await this.prisma.savedProgram.findUnique({ where: { userId_programId: { userId, programId: id } } })) : undefined;
    const now = new Date();
    return {
      ...this.view(p, now, userId ? matchProgram(p, { industry: ctx.industry, profile: ctx.profile, now }) : undefined, saved),
      eligibility: p.eligibility, summary: p.summary,
      notice: p.isDemo ? '시연용 가상 공고예요. 실제 기관·사업이 아니에요.' : '신청은 원문 공고에서 진행해요. PLIT 은 공고 정보를 모아 보여줄 뿐 선정에 관여하지 않아요.',
    };
  }

  async setSaved(userId: string, programId: string, on: boolean) {
    if (!(await this.prisma.startupProgram.findUnique({ where: { id: programId } }))) throw NotFound('지원사업');
    if (on) await this.prisma.savedProgram.createMany({ data: [{ userId, programId }], skipDuplicates: true });
    else await this.prisma.savedProgram.deleteMany({ where: { userId, programId } });
    return { saved: on };
  }

  async saved(userId: string) {
    const rows = await this.prisma.savedProgram.findMany({ where: { userId }, include: { program: true }, orderBy: { createdAt: 'desc' } });
    const now = new Date();
    return rows.filter((r) => r.program.status === 'ACTIVE').map((r) => this.view(r.program, now, undefined, true));
  }

  async profile(userId: string) {
    const ctx = await this.context(userId);
    const done = ctx.roadmap ?? {};
    return {
      ...ctx.profile, budget: ctx.budget ?? '', effectiveIndustry: ctx.industry, suggestion: ctx.suggestion, certs: ctx.certs,
      roadmap: ROADMAP.map((t) => ({ ...t, done: !!done[t.id] })), progress: { done: ROADMAP.filter((t) => done[t.id]).length, total: ROADMAP.length },
      fund: ctx.profile.sido && SINBO[ctx.profile.sido] ? { sido: ctx.profile.sido, name: SINBO[ctx.profile.sido][0], url: SINBO[ctx.profile.sido][1] } : null,
      industryChecks: INDUSTRIES.find((i) => i.code === ctx.industry)?.checks ?? [],
    };
  }

  async saveProfile(userId: string, dto: { industry: string | null; sido: string; sigungu: string; stage: string; budget: string }) {
    if (dto.industry !== null && !INDUSTRY_CODES.includes(dto.industry)) throw new AppError('INVALID_INDUSTRY', '업종을 다시 선택해주세요.');
    if (dto.sido && !SIDO.includes(dto.sido)) throw new AppError('INVALID_REGION', '시·도를 다시 선택해주세요.');
    if (!(dto.stage in STAGES)) throw new AppError('INVALID_STAGE', '창업 단계를 다시 선택해주세요.');
    if (dto.budget && !BUDGETS.includes(dto.budget)) throw new AppError('INVALID_BUDGET', '예산 범위를 다시 선택해주세요.');
    const data = { industry: dto.industry, sido: dto.sido, sigungu: dto.sido ? dto.sigungu.trim().slice(0, 20) : '', stage: dto.stage, budget: dto.budget };
    await this.prisma.startupProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    return this.profile(userId);
  }

  async setTask(userId: string, taskId: string, done: boolean) {
    if (!ROADMAP.some((t) => t.id === taskId)) throw NotFound('로드맵 단계');
    await this.prisma.$transaction(async (tx) => {
      await tx.startupProfile.createMany({ data: [{ userId }], skipDuplicates: true });
      await tx.$queryRaw`SELECT 1 FROM "StartupProfile" WHERE "userId" = ${userId} FOR UPDATE`;
      const p = await tx.startupProfile.findUniqueOrThrow({ where: { userId } });
      const roadmap = { ...((p.roadmap ?? {}) as Record<string, boolean>) };
      if (done) roadmap[taskId] = true; else delete roadmap[taskId];
      await tx.startupProfile.update({ where: { userId }, data: { roadmap } });
    });
    return this.profile(userId);
  }

  // ── 관리자 ──
  adminList() { return this.prisma.startupProgram.findMany({ orderBy: { updatedAt: 'desc' }, take: 300 }); }

  async adminCreate(adminId: string, dto: { title: string; agency: string; region: string; sigungu?: string; targetStages: string[]; industries: string[]; supportType: string; applyStart?: string; applyEnd?: string; eligibility: string; summary: string; sourceUrl: string }, ip?: string) {
    if (dto.region !== '전국' && !SIDO.includes(dto.region)) throw new AppError('INVALID_REGION', `지역은 전국 또는 시·도여야 해요: ${SIDO.join(', ')}`);
    if (!dto.targetStages.length || dto.targetStages.some((s) => !(s in STAGES))) throw new AppError('INVALID_STAGE', '대상 단계를 확인해주세요.');
    if (!dto.industries.length || dto.industries.some((i) => i !== 'ALL' && !INDUSTRY_CODES.includes(i))) throw new AppError('INVALID_INDUSTRY', '대상 업종을 확인해주세요.');
    if (!(dto.supportType in SUPPORT_TYPES)) throw new AppError('INVALID_SUPPORT_TYPE', '지원 유형을 확인해주세요.');
    if (!/^https:\/\//.test(dto.sourceUrl)) throw new AppError('SOURCE_URL_REQUIRED', '원문 공고 링크(https)를 입력해주세요.');
    const start = dto.applyStart ? new Date(dto.applyStart) : null, end = dto.applyEnd ? new Date(dto.applyEnd) : null;
    if ((start && isNaN(+start)) || (end && isNaN(+end)) || (start && end && start > end)) throw new AppError('INVALID_PERIOD', '접수 기간을 확인해주세요.');
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.startupProgram.create({ data: { provider: 'ADMIN', externalId: `admin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title: dto.title, agency: dto.agency, region: dto.region, sigungu: dto.region === '전국' ? null : dto.sigungu || null, targetStages: dto.targetStages, industries: dto.industries.includes('ALL') ? ['ALL'] : dto.industries, supportType: dto.supportType, applyStart: start, applyEnd: end, eligibility: dto.eligibility, summary: dto.summary, sourceUrl: dto.sourceUrl } });
      await this.audit.log(tx, { actorId: adminId, action: 'PROGRAM_CREATE', targetType: 'StartupProgram', targetId: p.id, after: { title: p.title, agency: p.agency }, ip });
      return p;
    });
  }

  async adminSetStatus(adminId: string, id: string, status: 'ACTIVE' | 'HIDDEN', ip?: string) {
    const before = await this.prisma.startupProgram.findUnique({ where: { id } });
    if (!before) throw NotFound('지원사업');
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.startupProgram.update({ where: { id }, data: { status } });
      await this.audit.log(tx, { actorId: adminId, action: 'PROGRAM_STATUS', targetType: 'StartupProgram', targetId: id, before: { status: before.status }, after: { status }, ip });
      return p;
    });
  }

  async adminMap() {
    const [ov, certs] = await Promise.all([this.mapOverrides(), this.prisma.certification.findMany({ select: { id: true, name: true } })]);
    return certs.filter((c) => ov[c.id] || CERT_INDUSTRY_DEFAULT[c.id]).map((c) => ({ certId: c.id, name: c.name, ...(ov[c.id] ?? CERT_INDUSTRY_DEFAULT[c.id]), overridden: !!ov[c.id] }));
  }

  async adminSetMap(adminId: string, certId: string, v: { industry: string; reason: string } | null, ip?: string) {
    if (!(await this.prisma.certification.findUnique({ where: { id: certId } }))) throw NotFound('자격증');
    if (v && !INDUSTRY_CODES.includes(v.industry)) throw new AppError('INVALID_INDUSTRY', '업종을 확인해주세요.');
    return this.prisma.$transaction(async (tx) => {
      if (v === null) await tx.certIndustryMap.deleteMany({ where: { certId } });
      else await tx.certIndustryMap.upsert({ where: { certId }, create: { certId, ...v }, update: v });
      await this.audit.log(tx, { actorId: adminId, action: 'STARTUP_MAP_UPDATE', targetType: 'Certification', targetId: certId, after: v, ip });
      return { certId, mapping: v };
    });
  }
}
