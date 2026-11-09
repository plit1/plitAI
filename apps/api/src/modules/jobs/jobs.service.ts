import { Injectable } from '@nestjs/common';
import { JobPosting, Prisma } from '@prisma/client';
import { AppError, NotFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../admin/audit.service';
import { EMPLOYMENT, EXPERIENCE, JobProfileLike, keywordsFor, lifecycle, matchJob, MyCert, REGIONS, searchHit } from './jobs.rules';
import { MyCertsService } from './my-certs.service';

export interface JobQuery { q?: string; region?: string; employment?: string; experience?: string; certId?: string; sort?: 'match' | 'deadline' | 'recent'; includeClosed?: boolean }
const EMPTY_PROFILE: JobProfileLike = { regions: [], roles: [], experience: null, employment: [] };

/** 공급자 상태 (고용24·사람인은 공식 승인·키 전 호출하지 않음 — 데모 JB_PROVIDERS 동일) */
export const JOB_PROVIDERS = (env: { WORK24_API_KEY?: string }) => [
  { id: 'ADMIN', name: 'PLIT 운영 등록 공고', status: 'ACTIVE' },
  { id: 'DEMO', name: 'PLIT 데모 공고 (가상 회사)', status: 'ACTIVE', note: '시연용 가상 공고 — 운영 전 숨김' },
  { id: 'WORK24', name: '고용24 OPEN-API', status: env.WORK24_API_KEY ? 'PENDING_ADAPTER' : 'NOT_CONFIGURED', docs: 'https://www.work24.go.kr/cm/e/a/0110/selectOpenApiIntro.do', note: '공식 신청·승인 후 서버 프록시로 연결 (응답 명세 확인 전 미구현)' },
  { id: 'SARAMIN', name: '사람인 공식 API', status: 'PLANNED', docs: 'https://oapi.saramin.co.kr/guide/info', note: '제휴·상업적 이용 권한 확인 전 호출하지 않음' },
];

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService, private readonly myCerts: MyCertsService, private readonly audit: AuditService) {}

  private async context(userId?: string) {
    const [overrides, certs, profile, allCerts] = await Promise.all([
      this.prisma.certJobMap.findMany(),
      userId ? this.myCerts.list(userId) : Promise.resolve([] as MyCert[]),
      userId ? this.prisma.jobProfile.findUnique({ where: { userId } }) : Promise.resolve(null),
      this.prisma.certification.findMany({ select: { id: true, name: true, field: true } }),
    ]);
    const ov = Object.fromEntries(overrides.map((o) => [o.certId, o.keywords]));
    const field = new Map(allCerts.map((c) => [c.id, c.field]));
    const keywords = (id: string) => keywordsFor(id, field.get(id), ov);
    return {
      certs, profile: profile ? { regions: profile.regions, roles: profile.roles, experience: profile.experience, employment: profile.employment } : EMPTY_PROFILE, keywords,
      certName: (id: string) => allCerts.find((c) => c.id === id)?.name,
      certByName: (q: string) => allCerts.find((c) => c.name.toLowerCase().includes(q))?.id,
    };
  }

  private view(j: JobPosting, now: Date, match?: ReturnType<typeof matchJob>, certName?: (id: string) => string | undefined, saved?: boolean) {
    return {
      id: j.id, provider: j.provider, isDemo: j.isDemo, companyName: j.companyName, title: j.title, workLocation: j.workLocation, region: j.region,
      employmentType: j.employmentType, experience: j.experience, experienceLabel: EXPERIENCE[j.experience] ?? j.experience, education: j.education, salary: j.salary,
      requiredCerts: j.requiredCerts.map((id) => ({ id, name: certName?.(id) ?? id })), preferredCerts: j.preferredCerts.map((id) => ({ id, name: certName?.(id) ?? id })),
      categories: j.categories, postedAt: j.postedAt, expiresAt: j.expiresAt, life: lifecycle(j, now), originalUrl: j.originalUrl, fetchedAt: j.fetchedAt,
      ...(match ? { match: { score: match.score, level: match.level, reasons: match.reasons } } : {}), ...(saved === undefined ? {} : { saved }),
    };
  }

  /** 검색: 마감·보관 공고는 기본 제외. 로그인 시 맞춤도 계산 */
  async search(userId: string | undefined, q: JobQuery) {
    const now = new Date();
    const where: Prisma.JobPostingWhereInput = { status: 'ACTIVE' };
    if (q.region) where.region = q.region;
    if (q.employment) where.employmentType = q.employment;
    if (q.experience) where.experience = { in: [q.experience, 'ANY'] };
    if (q.certId) where.OR = [{ requiredCerts: { has: q.certId } }, { preferredCerts: { has: q.certId } }];
    const [rows, ctx, saved] = await Promise.all([
      this.prisma.jobPosting.findMany({ where, take: 500, orderBy: { postedAt: 'desc' } }),
      this.context(userId),
      userId ? this.prisma.savedJob.findMany({ where: { userId }, select: { jobId: true } }) : Promise.resolve([]),
    ]);
    const savedIds = new Set(saved.map((s) => s.jobId));
    let list = rows.filter((j) => (q.includeClosed || lifecycle(j, now) !== 'EXPIRED') && (!q.q || searchHit(j, q.q, ctx.certName, ctx.certByName, ctx.keywords)));
    if (q.certId && !q.q) {
      // 자격증 페이지: 필수·우대 공고 + 관련 직무 키워드 공고
      const kw = ctx.keywords(q.certId);
      const extra = (await this.prisma.jobPosting.findMany({ where: { status: 'ACTIVE', categories: { hasSome: kw.length ? kw : ['__none__'] } }, take: 200 })).filter((j) => !list.some((x) => x.id === j.id) && lifecycle(j, now) !== 'EXPIRED');
      list = [...list, ...extra];
    }
    const items = list.map((j) => this.view(j, now, userId ? matchJob(j, { ...ctx, now }) : undefined, ctx.certName, userId ? savedIds.has(j.id) : undefined));
    if (q.sort === 'deadline') items.sort((a, b) => (a.expiresAt?.getTime() ?? Infinity) - (b.expiresAt?.getTime() ?? Infinity));
    else if (q.sort === 'match' && userId) items.sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0));
    return { items, total: items.length, regions: REGIONS, employment: EMPLOYMENT, experience: EXPERIENCE };
  }

  /** 맞춤 추천: 맞춤도 보통 이상, 점수순 */
  async recommended(userId: string) {
    const r = await this.search(userId, { sort: 'match' });
    const certs = await this.myCerts.list(userId);
    return { certs, items: r.items.filter((i) => i.match && (i.match.level === 'HIGH' || i.match.level === 'MID')).slice(0, 30) };
  }

  async detail(id: string, userId?: string) {
    const j = await this.prisma.jobPosting.findUnique({ where: { id } });
    if (!j || j.status === 'ARCHIVED') throw NotFound('채용공고');
    const ctx = await this.context(userId);
    const saved = userId ? !!(await this.prisma.savedJob.findUnique({ where: { userId_jobId: { userId, jobId: id } } })) : undefined;
    return { ...this.view(j, new Date(), userId ? matchJob(j, { ...ctx, now: new Date() }) : undefined, ctx.certName, saved), description: j.description, notice: j.isDemo ? '시연용 가상 공고예요. 실제 회사·채용이 아니에요.' : '지원은 원문 공고에서 진행해요. PLIT 은 공고 정보를 모아 보여줄 뿐 채용을 중개하지 않아요.' };
  }

  async setSaved(userId: string, jobId: string, on: boolean) {
    if (!(await this.prisma.jobPosting.findUnique({ where: { id: jobId } }))) throw NotFound('채용공고');
    if (on) await this.prisma.savedJob.createMany({ data: [{ userId, jobId }], skipDuplicates: true });
    else await this.prisma.savedJob.deleteMany({ where: { userId, jobId } });
    return { saved: on };
  }

  async saved(userId: string) {
    const rows = await this.prisma.savedJob.findMany({ where: { userId }, include: { job: true }, orderBy: { createdAt: 'desc' } });
    const now = new Date();
    return rows.map((r) => this.view(r.job, now, undefined, undefined, true));
  }

  async profile(userId: string) {
    const p = await this.prisma.jobProfile.findUnique({ where: { userId } });
    return { ...(p ?? EMPTY_PROFILE), certs: await this.myCerts.list(userId), options: { regions: REGIONS, employment: EMPLOYMENT, experience: EXPERIENCE } };
  }

  async saveProfile(userId: string, dto: JobProfileLike) {
    if (dto.regions.some((r) => !REGIONS.includes(r))) throw new AppError('INVALID_REGION', '지역을 다시 선택해주세요.');
    if (dto.employment.some((e) => !EMPLOYMENT.includes(e))) throw new AppError('INVALID_EMPLOYMENT', '고용 형태를 다시 선택해주세요.');
    if (dto.experience && !(dto.experience in EXPERIENCE)) throw new AppError('INVALID_EXPERIENCE', '경력 조건을 다시 선택해주세요.');
    const roles = [...new Set(dto.roles.map((r) => r.trim()).filter(Boolean))].slice(0, 10);
    const data = { regions: dto.regions, roles, experience: dto.experience, employment: dto.employment };
    await this.prisma.jobProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    return this.profile(userId);
  }

  async claim(userId: string, certId: string, on: boolean) {
    if (!(await this.prisma.certification.findUnique({ where: { id: certId } }))) throw NotFound('자격증');
    if (on) await this.prisma.userCertClaim.createMany({ data: [{ userId, certId }], skipDuplicates: true });
    else await this.prisma.userCertClaim.deleteMany({ where: { userId, certId } });
    return this.myCerts.list(userId);
  }

  // ── 관리자 ──
  async adminCreate(adminId: string, dto: { companyName: string; title: string; description: string; workLocation: string; employmentType: string; experience: string; education?: string; requiredCerts: string[]; preferredCerts: string[]; categories: string[]; salary?: string; expiresAt?: string; originalUrl: string }, ip?: string) {
    const region = dto.workLocation.trim().split(/\s+/)[0];
    if (!REGIONS.includes(region)) throw new AppError('INVALID_REGION', `근무지는 시·도로 시작해야 해요 (예: 경기 화성). 가능: ${REGIONS.join(', ')}`);
    if (!EMPLOYMENT.includes(dto.employmentType)) throw new AppError('INVALID_EMPLOYMENT', '고용 형태를 확인해주세요.');
    if (!(dto.experience in EXPERIENCE)) throw new AppError('INVALID_EXPERIENCE', '경력 조건을 확인해주세요.');
    if (!/^https:\/\//.test(dto.originalUrl)) throw new AppError('ORIGINAL_URL_REQUIRED', '원문 공고 링크(https)를 입력해주세요.');
    const ids = [...dto.requiredCerts, ...dto.preferredCerts];
    if (ids.length && (await this.prisma.certification.count({ where: { id: { in: ids } } })) !== new Set(ids).size) throw new AppError('INVALID_CERT', '알 수 없는 자격증 ID 가 있어요.');
    return this.prisma.$transaction(async (tx) => {
      const j = await tx.jobPosting.create({ data: { provider: 'ADMIN', providerJobId: `admin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...dto, region, postedAt: new Date(), expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null } });
      await this.audit.log(tx, { actorId: adminId, action: 'JOB_CREATE', targetType: 'JobPosting', targetId: j.id, after: { title: j.title, companyName: j.companyName }, ip });
      return j;
    });
  }

  async adminSetStatus(adminId: string, id: string, status: 'ACTIVE' | 'ARCHIVED', ip?: string) {
    const before = await this.prisma.jobPosting.findUnique({ where: { id } });
    if (!before) throw NotFound('채용공고');
    return this.prisma.$transaction(async (tx) => {
      const j = await tx.jobPosting.update({ where: { id }, data: { status } });
      await this.audit.log(tx, { actorId: adminId, action: 'JOB_STATUS', targetType: 'JobPosting', targetId: id, before: { status: before.status }, after: { status }, ip });
      return j;
    });
  }

  adminList() { return this.prisma.jobPosting.findMany({ orderBy: { createdAt: 'desc' }, take: 300 }); }

  async adminSetMap(adminId: string, certId: string, keywords: string[] | null, ip?: string) {
    if (!(await this.prisma.certification.findUnique({ where: { id: certId } }))) throw NotFound('자격증');
    return this.prisma.$transaction(async (tx) => {
      if (keywords === null) await tx.certJobMap.deleteMany({ where: { certId } });
      else await tx.certJobMap.upsert({ where: { certId }, create: { certId, keywords, updatedBy: adminId }, update: { keywords, updatedBy: adminId } });
      await this.audit.log(tx, { actorId: adminId, action: 'JOB_MAP_UPDATE', targetType: 'Certification', targetId: certId, after: { keywords }, ip });
      return { certId, keywords };
    });
  }
}
