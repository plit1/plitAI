import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PointEntryType, PointLedgerEntry } from '@prisma/client';
import { AppError, NotFound } from '../../common/errors';
import { PrismaService, Tx } from '../../common/prisma.service';

export interface PostEntryInput {
  userId: string;
  type: PointEntryType;
  amount: number;
  reason: string;
  dedupeKey: string;
  refType?: string;
  refId?: string;
  expiresAt?: Date | null;
  createdById?: string;
  /** 잔액이 음수가 되는 차감 허용 여부 (환불 회수 등 관리자 처리 전용) */
  allowNegative?: boolean;
}

/**
 * 포인트 원장 서비스.
 *  - 모든 변경은 반드시 호출자의 트랜잭션(tx) 안에서 수행 → 원장·잔액·업무 데이터가 함께 커밋/롤백
 *  - 계정 행을 SELECT ... FOR UPDATE 로 잠가 동시 차감 시 음수 잔액 방지
 *  - dedupeKey 유니크 → 같은 사건은 몇 번 호출돼도 1건만 반영 (기존 행 반환)
 */
@Injectable()
export class PointsService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  private get rewardsLive(): boolean { return this.config.get('REWARDS_LIVE') === true; }

  async post(tx: Tx, input: PostEntryInput): Promise<{ entry: PointLedgerEntry; duplicate: boolean }> {
    if (!Number.isInteger(input.amount)) throw new AppError('INVALID_AMOUNT', '포인트는 정수여야 해요.');
    const existing = await tx.pointLedgerEntry.findUnique({ where: { dedupeKey: input.dedupeKey } });
    if (existing) return { entry: existing, duplicate: true };

    await tx.$executeRaw`INSERT INTO "PointAccount" ("userId","balance","version","updatedAt") VALUES (${input.userId}, 0, 0, now()) ON CONFLICT ("userId") DO NOTHING`;
    const [account] = await tx.$queryRaw<{ balance: number }[]>`SELECT "balance" FROM "PointAccount" WHERE "userId" = ${input.userId} FOR UPDATE`;
    // 잠금 대기 중 다른 트랜잭션이 같은 dedupeKey 를 커밋했을 수 있음 → 재확인
    const raced = await tx.pointLedgerEntry.findUnique({ where: { dedupeKey: input.dedupeKey } });
    if (raced) return { entry: raced, duplicate: true };

    const balanceAfter = account.balance + input.amount;
    if (balanceAfter < 0 && !input.allowNegative) {
      throw new AppError('INSUFFICIENT_POINTS', `${(-balanceAfter).toLocaleString('ko-KR')}P가 부족해요.`, HttpStatus.UNPROCESSABLE_ENTITY, { balance: account.balance, required: -input.amount });
    }
    const entry = await tx.pointLedgerEntry.create({
      data: {
        userId: input.userId, type: input.type, amount: input.amount, balanceAfter, reason: input.reason,
        dedupeKey: input.dedupeKey, refType: input.refType, refId: input.refId, expiresAt: input.expiresAt ?? null,
        isVirtual: !this.rewardsLive, createdById: input.createdById,
      },
    });
    await tx.pointAccount.update({ where: { userId: input.userId }, data: { balance: balanceAfter, version: { increment: 1 } } });
    return { entry, duplicate: false };
  }

  /** 역분개. 원 거래 1건은 한 번만 취소할 수 있다 (reversesId 유니크). */
  async reverse(tx: Tx, entryId: string, reason: string, createdById?: string) {
    const orig = await tx.pointLedgerEntry.findUnique({ where: { id: entryId } });
    if (!orig) throw NotFound('포인트 거래');
    if (orig.type === 'REVERSAL') throw new AppError('CANNOT_REVERSE', '취소 거래는 다시 취소할 수 없어요.');
    const result = await this.post(tx, {
      userId: orig.userId, type: 'REVERSAL', amount: -orig.amount, reason, dedupeKey: `reverse:${orig.id}`,
      refType: 'POINT_ENTRY', refId: orig.id, createdById, allowNegative: orig.amount > 0,
    });
    if (!result.duplicate) await tx.pointLedgerEntry.update({ where: { id: result.entry.id }, data: { reversesId: orig.id } });
    return result;
  }

  async balance(userId: string) {
    const acc = await this.prisma.pointAccount.findUnique({ where: { userId } });
    return acc?.balance ?? 0;
  }

  async history(userId: string, cursor?: string, take = 30) {
    const rows = await this.prisma.pointLedgerEntry.findMany({
      where: { userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return { items: rows.slice(0, take), nextCursor: rows.length > take ? rows[take - 1].id : null };
  }

  /** 정합성 검사: 캐시 잔액 == 원장 합계 == 마지막 balanceAfter */
  async audit(userId: string) {
    const [acc, sum, last] = await Promise.all([
      this.prisma.pointAccount.findUnique({ where: { userId } }),
      this.prisma.pointLedgerEntry.aggregate({ where: { userId }, _sum: { amount: true } }),
      this.prisma.pointLedgerEntry.findFirst({ where: { userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    ]);
    const cached = acc?.balance ?? 0;
    const ledger = sum._sum.amount ?? 0;
    return { cached, ledger, lastBalanceAfter: last?.balanceAfter ?? 0, consistent: cached === ledger };
  }
}
