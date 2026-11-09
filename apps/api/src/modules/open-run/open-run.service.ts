import { HttpStatus, Injectable } from '@nestjs/common';
import { OpenRunStatus, Prisma } from '@prisma/client';
import { AppError, Conflict, NotFound } from '../../common/errors';
import { PrismaService, Tx } from '../../common/prisma.service';
import { checkText, normalizeCertName } from '../../common/text-filter';
import { AuditService } from '../admin/audit.service';
import { PolicyService } from '../policy/policy.service';

const PUBLIC: OpenRunStatus[] = ['COLLECTING', 'THRESHOLD_REACHED', 'UNDER_REVIEW', 'OPENED'];
const INTEREST_OPEN: OpenRunStatus[] = ['COLLECTING', 'THRESHOLD_REACHED'];
export type OpenRunAction = 'APPROVE' | 'START_REVIEW' | 'REJECT' | 'OPEN';

@Injectable()
export class OpenRunService {
  constructor(private readonly prisma: PrismaService, private readonly policy: PolicyService, private readonly audit: AuditService) {}

  private view(r: Prisma.OpenRunRequestGetPayload<object>, interested?: boolean) {
    return {
      id: r.id, title: r.title, category: r.category, round: r.round, reason: r.reason, status: r.status,
      interestCount: r.interestCount, targetCount: r.targetCount, progress: Math.min(100, Math.round((r.interestCount / r.targetCount) * 100)),
      linkedOfferingId: r.linkedOfferingId, createdAt: r.createdAt, ...(interested === undefined ? {} : { interested }),
    };
  }

  async list(params: { status?: OpenRunStatus; sort?: 'popular' | 'recent'; q?: string }) {
    const where: Prisma.OpenRunRequestWhereInput = { status: params.status && PUBLIC.includes(params.status) ? params.status : { in: PUBLIC } };
    if (params.q) where.certificationKey = { contains: normalizeCertName(params.q) };
    const rows = await this.prisma.openRunRequest.findMany({ where, take: 100, orderBy: params.sort === 'recent' ? { createdAt: 'desc' } : [{ interestCount: 'desc' }, { createdAt: 'asc' }] });
    return rows.map((r) => this.view(r));
  }

  async detail(id: string, userId?: string) {
    const r = await this.prisma.openRunRequest.findUnique({ where: { id } });
    if (!r || (!PUBLIC.includes(r.status) && r.requestedById !== userId)) throw NotFound('개설 요청');
    const mine = userId ? await this.prisma.openRunInterest.findUnique({ where: { requestId_userId: { requestId: id, userId } } }) : null;
    return this.view(r, userId ? !!mine?.active : undefined);
  }

  /**
   * 신규 요청: 카탈로그에 이미 있는 자격증이면 안내, 같은 정규화 이름 요청이 있으면 관심으로 병합.
   * 새 요청은 PENDING_REVIEW 로 시작 (운영자 검토 후 공개).
   */
  async create(userId: string, input: { title: string; category: string; round?: string; reason?: string }, retried = false): Promise<{ request: ReturnType<OpenRunService['view']>; merged: boolean }> {
    const title = checkText(input.title);
    if (!title.ok) throw new AppError(`TEXT_${title.code}`, title.message);
    const reason = checkText(input.reason, { allowEmpty: true });
    if (!reason.ok) throw new AppError(`TEXT_${reason.code}`, reason.message);
    const key = normalizeCertName(title.text);
    if (key.length < 2) throw new AppError('TITLE_TOO_SHORT', '자격증 이름을 정확히 입력해주세요.');

    const certs = await this.prisma.certification.findMany({ where: { isActive: true }, select: { id: true, name: true } });
    const existingCert = certs.find((c) => normalizeCertName(c.name) === key);
    if (existingCert) throw new AppError('CERT_EXISTS', `이미 PLIT 에 있는 자격증이에요: ${existingCert.name}`, HttpStatus.CONFLICT, { certId: existingCert.id });

    const dup = await this.prisma.openRunRequest.findUnique({ where: { certificationKey: key } });
    if (dup) {
      if (dup.status === 'REJECTED') throw Conflict('REQUEST_REJECTED', '운영 검토에서 개설이 어렵다고 안내된 자격증이에요.');
      if (INTEREST_OPEN.includes(dup.status)) await this.setInterest(userId, dup.id, true);
      return { request: await this.detail(dup.id, userId), merged: true };
    }

    const { values } = await this.policy.current();
    const since = new Date(Date.now() - 86400000);
    if ((await this.prisma.openRunRequest.count({ where: { requestedById: userId, createdAt: { gte: since } } })) >= values.openRunDailyLimit) {
      throw new AppError('DAILY_LIMIT', `개설 요청은 하루 ${values.openRunDailyLimit}건까지 할 수 있어요.`, HttpStatus.TOO_MANY_REQUESTS);
    }
    try {
      const r = await this.prisma.$transaction(async (tx) => {
        const req = await tx.openRunRequest.create({
          data: { certificationKey: key, title: title.text.slice(0, 60), category: input.category, round: input.round?.slice(0, 30), reason: reason.text.slice(0, 300) || null, requestedById: userId, targetCount: values.openRunTarget },
        });
        await tx.openRunInterest.create({ data: { requestId: req.id, userId } });
        return this.reconcile(tx, req.id);
      });
      return { request: this.view(r, true), merged: false };
    } catch (e) {
      // 같은 이름을 동시에 요청한 경우 → 병합으로 재시도
      if (!retried && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return this.create(userId, input, true);
      throw e;
    }
  }

  /** 관심 표시/취소. 모집 단계(COLLECTING·THRESHOLD_REACHED)에서만 */
  async setInterest(userId: string, requestId: string, active: boolean, notify = true) {
    return this.prisma.$transaction(async (tx) => {
      const [r] = await tx.$queryRaw<{ status: OpenRunStatus }[]>`SELECT "status" FROM "OpenRunRequest" WHERE "id" = ${requestId} FOR UPDATE`;
      if (!r) throw NotFound('개설 요청');
      if (!INTEREST_OPEN.includes(r.status)) throw Conflict('NOT_COLLECTING', '지금은 관심을 받는 단계가 아니에요.');
      await tx.openRunInterest.upsert({ where: { requestId_userId: { requestId, userId } }, create: { requestId, userId, active, notify }, update: { active, notify } });
      return this.view(await this.reconcile(tx, requestId), active);
    });
  }

  /** 데모 orReconcile: 관심 수는 관심 레코드에서만 파생 → 목표 도달/미달에 따라 상태 전환 (자동 개설 없음) */
  private async reconcile(tx: Tx, requestId: string) {
    const count = await tx.openRunInterest.count({ where: { requestId, active: true } });
    const r = await tx.openRunRequest.findUniqueOrThrow({ where: { id: requestId } });
    let status = r.status;
    if (status === 'COLLECTING' && count >= r.targetCount) status = 'THRESHOLD_REACHED';
    else if (status === 'THRESHOLD_REACHED' && count < r.targetCount) status = 'COLLECTING';
    return tx.openRunRequest.update({ where: { id: requestId }, data: { interestCount: count, status } });
  }

  async mine(userId: string) {
    const [requested, interests] = await Promise.all([
      this.prisma.openRunRequest.findMany({ where: { requestedById: userId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.openRunInterest.findMany({ where: { userId, active: true }, include: { request: true }, orderBy: { createdAt: 'desc' } }),
    ]);
    return { requested: requested.map((r) => ({ ...this.view(r), reviewNote: r.status === 'REJECTED' ? r.reviewNote : null })), interested: interests.map((i) => this.view(i.request, true)) };
  }

  adminList(status?: OpenRunStatus) {
    return this.prisma.openRunRequest.findMany({ where: status ? { status } : {}, orderBy: [{ status: 'asc' }, { interestCount: 'desc' }], take: 200, include: { requestedBy: { select: { id: true, nickname: true } } } });
  }

  /** 운영자 심사: 상태 전이 규칙을 서버에서 강제 + 감사 로그 */
  async review(adminId: string, id: string, action: OpenRunAction, opts: { note?: string; offeringId?: string; ip?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const [r] = await tx.$queryRaw<{ id: string; status: OpenRunStatus }[]>`SELECT "id","status" FROM "OpenRunRequest" WHERE "id" = ${id} FOR UPDATE`;
      if (!r) throw NotFound('개설 요청');
      const allowed: Record<OpenRunAction, OpenRunStatus[]> = {
        APPROVE: ['PENDING_REVIEW'], START_REVIEW: ['COLLECTING', 'THRESHOLD_REACHED'],
        REJECT: ['PENDING_REVIEW', 'COLLECTING', 'THRESHOLD_REACHED', 'UNDER_REVIEW'], OPEN: ['THRESHOLD_REACHED', 'UNDER_REVIEW'],
      };
      if (!allowed[action].includes(r.status)) throw Conflict('INVALID_TRANSITION', `${r.status} 상태에서는 할 수 없는 처리예요.`);
      if (action === 'REJECT' && !opts.note) throw new AppError('NOTE_REQUIRED', '반려 사유를 입력해주세요.');
      const data: Prisma.OpenRunRequestUpdateInput = { reviewNote: opts.note ?? null };
      if (action === 'APPROVE') data.status = 'COLLECTING';
      if (action === 'START_REVIEW') data.status = 'UNDER_REVIEW';
      if (action === 'REJECT') data.status = 'REJECTED';
      if (action === 'OPEN') {
        if (!opts.offeringId) throw new AppError('OFFERING_REQUIRED', '연결할 챌린지 회차를 선택해주세요.');
        const o = await tx.challengeOffering.findUnique({ where: { id: opts.offeringId } });
        if (!o) throw NotFound('챌린지 회차');
        Object.assign(data, { status: 'OPENED', linkedOfferingId: o.id, certId: o.certId });
      }
      let after = await tx.openRunRequest.update({ where: { id }, data });
      if (action === 'APPROVE') after = await this.reconcile(tx, id);
      await this.audit.log(tx, { actorId: adminId, action: `OPEN_RUN_${action}`, targetType: 'OpenRunRequest', targetId: id, before: { status: r.status }, after: { status: after.status, note: opts.note, offeringId: opts.offeringId }, ip: opts.ip });
      // 개설 알림 대상: notify=true 활성 관심자 (발송은 알림 모듈 — Phase 7)
      const notifyCount = action === 'OPEN' ? await tx.openRunInterest.count({ where: { requestId: id, active: true, notify: true } }) : 0;
      return { ...this.view(after), notifyCount };
    });
  }
}
