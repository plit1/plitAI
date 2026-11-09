import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { aggregateRevenue, bucket, toCsv } from './settlement.rules';

export interface RangeQuery { from: string; to: string; by: 'day' | 'month'; includeTest?: boolean }
const kstStart = (d: string) => new Date(`${d}T00:00:00+09:00`);

@Injectable()
export class SettlementService {
  constructor(private readonly prisma: PrismaService) {}

  private range(q: RangeQuery) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(q.from) || !/^\d{4}-\d{2}-\d{2}$/.test(q.to)) throw new AppError('INVALID_RANGE', '기간은 YYYY-MM-DD 로 입력해주세요.');
    const from = kstStart(q.from), to = new Date(kstStart(q.to).getTime() + 86400000); // to 포함
    if (to <= from) throw new AppError('INVALID_RANGE', '종료일이 시작일보다 빨라요.');
    if (to.getTime() - from.getTime() > 400 * 86400000) throw new AppError('INVALID_RANGE', '최대 400일까지 조회할 수 있어요.');
    return { from, to };
  }

  /** 매출: 결제(승인일)·환불(환불일)·순매출·공급가/부가세. 테스트 주문은 기본 제외 */
  async revenue(q: RangeQuery) {
    const { from, to } = this.range(q);
    const test: Prisma.OrderWhereInput = q.includeTest ? {} : { isTest: false };
    const [paid, refunded] = await Promise.all([
      this.prisma.order.findMany({ where: { ...test, approvedAt: { gte: from, lt: to }, status: { in: ['PAID', 'REFUNDED', 'PARTIAL_REFUNDED'] } }, select: { approvedAt: true, amount: true } }),
      this.prisma.order.findMany({ where: { ...test, refundedAt: { gte: from, lt: to }, refundedAmount: { gt: 0 } }, select: { refundedAt: true, refundedAmount: true } }),
    ]);
    const rows = aggregateRevenue(paid.map((p) => ({ at: p.approvedAt!, amount: p.amount })), refunded.map((r) => ({ at: r.refundedAt!, amount: r.refundedAmount })), q.by);
    const total = rows.reduce((t, r) => ({ paidCount: t.paidCount + r.paidCount, paidAmount: t.paidAmount + r.paidAmount, refundCount: t.refundCount + r.refundCount, refundAmount: t.refundAmount + r.refundAmount, netAmount: t.netAmount + r.netAmount, supply: t.supply + r.supply, vat: t.vat + r.vat }), { paidCount: 0, paidAmount: 0, refundCount: 0, refundAmount: 0, netAmount: 0, supply: 0, vat: 0 });
    return { from: q.from, to: q.to, by: q.by, includeTest: !!q.includeTest, rows, total, note: '부가세 반올림 규칙은 세무 확인 전 잠정이에요.' };
  }

  async revenueCsv(q: RangeQuery) {
    const r = await this.revenue(q);
    return toCsv(['기간', '결제건수', '결제금액', '환불건수', '환불금액', '순매출', '공급가액', '부가세'], [
      ...r.rows.map((x) => [x.period, x.paidCount, x.paidAmount, x.refundCount, x.refundAmount, x.netAmount, x.supply, x.vat]),
      ['합계', r.total.paidCount, r.total.paidAmount, r.total.refundCount, r.total.refundAmount, r.total.netAmount, r.total.supply, r.total.vat],
    ]);
  }

  /** 포인트: 기간별 유형 집계 + 현재 미사용 잔액(부채). 가상/실제 포인트 구분 */
  async points(q: RangeQuery) {
    const { from, to } = this.range(q);
    const entries = await this.prisma.pointLedgerEntry.findMany({ where: { createdAt: { gte: from, lt: to } }, select: { createdAt: true, type: true, amount: true, isVirtual: true } });
    const m = new Map<string, Record<string, number>>();
    for (const e of entries) {
      const k = bucket(e.createdAt, q.by);
      const row = m.get(k) ?? { EARN: 0, SPEND: 0, REVERSAL: 0, EXPIRE: 0, ADJUST: 0, RESULT: 0 };
      row[e.type] += e.amount; m.set(k, row);
    }
    const [liab, liveLiab] = await Promise.all([
      this.prisma.pointAccount.aggregate({ _sum: { balance: true } }),
      this.prisma.pointLedgerEntry.aggregate({ where: { isVirtual: false }, _sum: { amount: true } }),
    ]);
    return {
      rows: [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, v]) => ({ period, ...v })),
      outstandingBalance: liab._sum.balance ?? 0,
      outstandingLive: liveLiab._sum.amount ?? 0, // REWARDS_LIVE 전환 후 쌓인 실제 가치 포인트
    };
  }
}
