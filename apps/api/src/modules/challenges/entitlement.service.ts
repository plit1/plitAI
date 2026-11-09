import { Global, Injectable, Module } from '@nestjs/common';
import { Enrollment, Plan } from '@prisma/client';
import { Forbidden, NotFound } from '../../common/errors';
import { PrismaService, Tx } from '../../common/prisma.service';
import { Feature } from '../policy/policy.defaults';
import { PolicyService } from '../policy/policy.service';

/**
 * 기능 접근 권한(Entitlement) — 화면 숨김과 무관하게 서버에서 강제.
 * PREMIUM 은 참여 기록의 plan 뿐 아니라 연결된 패스가 ACTIVE·미만료인지 다시 확인한다.
 */
@Injectable()
export class EntitlementService {
  constructor(private readonly prisma: PrismaService, private readonly policy: PolicyService) {}

  async findActivePass(db: Tx | PrismaService, userId: string, offeringId: string) {
    return db.boosterPass.findFirst({ where: { userId, offeringId, status: 'ACTIVE', expiresAt: { gt: new Date() } } });
  }

  /** 실효 plan: PREMIUM 인데 패스가 무효면 FREE 로 취급 */
  async effectivePlan(enrollment: Enrollment): Promise<Plan> {
    if (enrollment.plan !== 'PREMIUM') return 'FREE';
    const pass = enrollment.passId ? await this.prisma.boosterPass.findUnique({ where: { id: enrollment.passId } }) : null;
    return pass && pass.status === 'ACTIVE' && pass.expiresAt > new Date() ? 'PREMIUM' : 'FREE';
  }

  /** 본인 참여 + 기능 권한 확인. 통과하면 enrollment 반환 */
  async require(userId: string, enrollmentId: string, feature: Feature) {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId } });
    if (!enrollment || enrollment.userId !== userId) throw NotFound('챌린지 참여 기록'); // 타인 기록 존재 여부도 노출하지 않음
    if (enrollment.status === 'CANCELLED') throw Forbidden('ENROLLMENT_CANCELLED', '취소된 참여예요.');
    const plan = await this.effectivePlan(enrollment);
    const { values } = await this.policy.current();
    if (!this.policy.canUse(values, plan, feature)) throw Forbidden('PREMIUM_REQUIRED', '플릿 부스터 패스 전용 기능이에요.');
    return { enrollment, plan };
  }
}

@Global()
@Module({ providers: [EntitlementService], exports: [EntitlementService] })
export class EntitlementModule {}
