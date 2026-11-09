import { Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CertStatus, MyCert } from './jobs.rules';

/** 내 자격증 상태 (취업·창업 공용): 증빙 검증(합격 승인) > 본인 신고 > 준비 중(챌린지 참여) */
@Injectable()
export class MyCertsService {
  constructor(private readonly prisma: PrismaService) {}
  async list(userId: string): Promise<MyCert[]> {
    const [enrs, claims] = await Promise.all([
      this.prisma.enrollment.findMany({ where: { userId, status: { not: 'CANCELLED' } }, select: { certId: true, verification: { select: { status: true } } } }),
      this.prisma.userCertClaim.findMany({ where: { userId } }),
    ]);
    const status = new Map<string, CertStatus>();
    const rank: Record<CertStatus, number> = { VERIFIED: 3, CLAIMED: 2, PREPARING: 1 };
    const set = (id: string, s: CertStatus) => { if (!status.has(id) || rank[s] > rank[status.get(id)!]) status.set(id, s); };
    for (const e of enrs) set(e.certId, e.verification?.status === 'APPROVED' ? 'VERIFIED' : 'PREPARING');
    for (const c of claims) set(c.certId, 'CLAIMED');
    const certs = await this.prisma.certification.findMany({ where: { id: { in: [...status.keys()] } }, select: { id: true, name: true } });
    return certs.map((c) => ({ certId: c.id, name: c.name, status: status.get(c.id)! })).sort((a, b) => rank[b.status] - rank[a.status]);
  }
}

@Global()
@Module({ providers: [MyCertsService], exports: [MyCertsService] })
export class MyCertsModule {}
