import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Tx } from '../../common/prisma.service';

/** 결제·환불·포인트·합격 인증·정책 관련 관리자 작업은 반드시 같은 트랜잭션에서 기록한다. */
@Injectable()
export class AuditService {
  async log(tx: Tx, e: { actorId: string; action: string; targetType: string; targetId: string; before?: unknown; after?: unknown; ip?: string }) {
    const json = (v: unknown) => (v === undefined ? undefined : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue));
    await tx.adminAuditLog.create({ data: { actorId: e.actorId, action: e.action, targetType: e.targetType, targetId: e.targetId, before: json(e.before), after: json(e.after), ip: e.ip } });
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
