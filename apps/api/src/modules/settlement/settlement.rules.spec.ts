import { aggregateRevenue, bucket, toCsv, vatSplit } from './settlement.rules';

describe('정산 계산', () => {
  it('부가세 분리: 29,000원 → 공급가 26,364 + 부가세 2,636, 합계 보존', () => {
    expect(vatSplit(29000)).toEqual({ total: 29000, supply: 26364, vat: 2636 });
    expect(vatSplit(0)).toEqual({ total: 0, supply: 0, vat: 0 });
    for (const t of [1, 11, 999, 58000, 123457]) { const v = vatSplit(t); expect(v.supply + v.vat).toBe(t); }
  });
  it('KST 버킷: UTC 15시 이후는 다음 날', () => {
    expect(bucket(new Date('2026-11-09T14:59:59Z'), 'day')).toBe('2026-11-09');
    expect(bucket(new Date('2026-11-09T15:00:00Z'), 'day')).toBe('2026-11-10');
    expect(bucket(new Date('2026-11-30T16:00:00Z'), 'month')).toBe('2026-12');
  });
  it('결제는 승인일, 환불은 환불일에 반영 — 월을 넘긴 환불은 다음 달 순매출 차감', () => {
    const rows = aggregateRevenue(
      [{ at: new Date('2026-10-30T03:00:00Z'), amount: 29000 }, { at: new Date('2026-10-31T03:00:00Z'), amount: 29000 }],
      [{ at: new Date('2026-11-02T03:00:00Z'), amount: 29000 }], 'month');
    expect(rows).toEqual([
      { period: '2026-10', paidCount: 2, paidAmount: 58000, refundCount: 0, refundAmount: 0, netAmount: 58000, supply: 52727, vat: 5273 },
      { period: '2026-11', paidCount: 0, paidAmount: 0, refundCount: 1, refundAmount: 29000, netAmount: -29000, supply: -26364, vat: -2636 },
    ]);
  });
  it('CSV: BOM·쉼표/따옴표 이스케이프·수식 주입 방지', () => {
    const csv = toCsv(['기간', '메모'], [['2026-11', 'a,"b"'], ['x', '=HYPERLINK("evil")'], ['y', -100]]);
    expect(csv.startsWith('﻿기간,메모\r\n')).toBe(true);
    expect(csv).toContain('2026-11,"a,""b"""');
    expect(csv).toContain(`x,"'=HYPERLINK(""evil"")"`);
    expect(csv).toContain('y,-100'); // 숫자 음수는 그대로
  });
});
