import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AppError, Conflict, Forbidden, NotFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { kstDate } from '../../common/time';
import { EntitlementService } from '../challenges/entitlement.service';
import { StudyService } from '../study/study.service';
import { badges, COSMETICS, deriveCondition, GX, isoWeek, stageMeta, titleFor, validatePetName, xpProgress } from './gx.rules';
import { XpService } from './xp.service';

const TODAY_GOAL_MIN = 82; // 데모 baseRecommendedMin

@Injectable()
export class GamificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Gamification');
  private timer?: NodeJS.Timeout;
  constructor(private readonly prisma: PrismaService, private readonly xp: XpService, private readonly study: StudyService, private readonly entitlements: EntitlementService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => this.awardWeeklyWins().catch((e) => this.logger.error(e)), 6 * 3600_000);
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  /** 부스터 패스가 유효한 참여가 하나라도 있으면 프리미엄 코스튬 사용 가능 (데모 gxIsPremiumMember) */
  private async isPremium(userId: string) {
    const enrs = await this.prisma.enrollment.findMany({ where: { userId, status: 'ACTIVE', plan: 'PREMIUM' } });
    for (const e of enrs) if ((await this.entitlements.effectivePlan(e)) === 'PREMIUM') return true;
    return false;
  }

  async view(userId: string) {
    const [pet, t, sources, evolutions, last, todayRows, premium] = await Promise.all([
      this.prisma.pet.findUnique({ where: { userId } }),
      this.xp.totals(this.prisma, userId),
      this.prisma.xpLedgerEntry.findMany({ where: { userId }, distinct: ['sourceType'], select: { sourceType: true } }),
      this.prisma.petEvolution.findMany({ where: { userId }, orderBy: { level: 'asc' } }),
      this.prisma.studySession.findFirst({ where: { userId, status: 'COMPLETED' }, orderBy: { endedAt: 'desc' }, select: { endedAt: true } }),
      this.prisma.studySession.aggregate({ where: { userId, status: 'COMPLETED', endedAt: { gte: new Date(`${kstDate()}T00:00:00+09:00`) } }, _sum: { minutes: true } }),
      this.isPremium(userId),
    ]);
    const b = badges(new Set(sources.map((s) => s.sourceType)), t.level);
    const earned = b.filter((x) => x.done).map((x) => x.id);
    const costume = COSMETICS.find((c) => c.id === pet?.selectedCostumeId);
    return {
      adopted: !!pet,
      pet: pet && { species: pet.species, name: pet.name, costume: costume?.premium && !premium ? 'none' : pet.selectedCostumeId, createdAt: pet.createdAt }, // 패스 만료 시 프리미엄 코스튬은 기본으로 표시
      xp: t.total, level: t.level, stage: stageMeta(t.level), progress: xpProgress(t.total, t.level), clears: t.clears,
      condition: deriveCondition(last?.endedAt ?? null, new Date(), (todayRows._sum.minutes ?? 0) >= TODAY_GOAL_MIN),
      badges: b, title: titleFor(t.level, earned),
      evolutions: evolutions.map((e) => ({ level: e.level, label: stageMeta(e.level).label, trigger: e.trigger, reachedAt: e.reachedAt })),
      cosmetics: COSMETICS.map((c) => ({ ...c, available: !c.premium || premium })), premium,
      stages: GX.stages, note: 'XP 와 레벨은 학습 동기용이에요. 포인트(P)와 별개이고 현금 가치가 없어요.',
    };
  }

  async adopt(userId: string, species: string, name?: string) {
    if (species !== 'DOG' && species !== 'CAT') throw new AppError('INVALID_SPECIES', '강아지 또는 고양이를 선택해주세요.');
    let petName = GX.defaultName;
    if (name && name.trim()) { const v = validatePetName(name); if (!v.ok) throw new AppError('INVALID_NAME', v.message); petName = v.name; }
    const created = await this.prisma.pet.createMany({ data: [{ userId, species, name: petName }], skipDuplicates: true });
    if (!created.count) throw Conflict('ALREADY_ADOPTED', '이미 함께하는 메이트가 있어요. 종류는 바꿀 수 있어요.');
    await this.prisma.petEvolution.createMany({ data: [{ userId, level: 1, trigger: 'adopt' }], skipDuplicates: true });
    return this.view(userId);
  }

  /** 이름·종류·코스튬 변경. 종류를 바꿔도 XP·레벨·배지·진화 기록은 유지 (데모 동일) */
  async update(userId: string, patch: { name?: string; species?: string; costume?: string }) {
    const pet = await this.prisma.pet.findUnique({ where: { userId } });
    if (!pet) throw NotFound('메이트');
    const data: { name?: string; species?: string; selectedCostumeId?: string } = {};
    if (patch.name !== undefined) { const v = validatePetName(patch.name); if (!v.ok) throw new AppError('INVALID_NAME', v.message); data.name = v.name; }
    if (patch.species !== undefined) { if (patch.species !== 'DOG' && patch.species !== 'CAT') throw new AppError('INVALID_SPECIES', '강아지 또는 고양이를 선택해주세요.'); data.species = patch.species; }
    if (patch.costume !== undefined) {
      const c = COSMETICS.find((x) => x.id === patch.costume);
      if (!c) throw new AppError('INVALID_COSTUME', '선택할 수 없는 코스튬이에요.');
      if (c.premium && !(await this.isPremium(userId))) throw Forbidden('PREMIUM_REQUIRED', '플릿 부스터 패스 참여 중에 사용할 수 있는 코스튬이에요.');
      data.selectedCostumeId = c.id;
    }
    await this.prisma.pet.update({ where: { userId }, data });
    return this.view(userId);
  }

  /**
   * 주간 WIN 보너스(XP): 모집·진행 중 회차 참여자 중 이번 주(ISO, KST) WIN 판정을 받은 참여당 1회.
   * 경제적 가치가 없는 XP 만 지급 (포인트 보상은 법률 검토 후 — decisions D-033).
   */
  async awardWeeklyWins(now = new Date()) {
    const week = isoWeek(now);
    const offerings = await this.prisma.challengeOffering.findMany({ where: { hidden: false, status: { in: ['open', 'closed', 'running'] } }, select: { id: true } });
    let checked = 0, awarded = 0;
    for (const o of offerings) {
      const enrs = await this.prisma.enrollment.findMany({ where: { offeringId: o.id, status: 'ACTIVE', user: { isTest: false, status: 'ACTIVE' } }, select: { id: true, userId: true } });
      if (enrs.length < 10) continue; // 최소 표본 미만 회차는 판정 불가
      for (const e of enrs) {
        checked++;
        const v = await this.study.competition(o.id, e.userId, now);
        if (v.wdl.status !== 'WIN') continue;
        const r = await this.prisma.$transaction((tx) => this.xp.award(tx, e.userId, [{ eventKey: `weekly-win:${e.id}:${week}`, sourceType: 'weekly', sourceId: e.id, deltaXp: GX.weeklyWinXp }]));
        if (r.awarded) awarded++;
      }
    }
    return { week, checked, awarded };
  }
}
