/** 정산 계산 (순수 함수). 금액은 원 단위 정수. */

/**
 * 부가세 포함 금액 → 공급가액·부가세. 공급가액 = 반올림(총액 × 10/11), 부가세 = 총액 − 공급가액.
 * 반올림 규칙은 세무 확인 전 잠정 (decisions D-026).
 */
export function vatSplit(total: number) {
  const supply = Math.round((total * 10) / 11);
  return { total, supply, vat: total - supply };
}

/** KST 기준 일(YYYY-MM-DD) 또는 월(YYYY-MM) 버킷 */
export function bucket(d: Date, by: 'day' | 'month') {
  const k = new Date(d.getTime() + 9 * 3600_000).toISOString();
  return by === 'day' ? k.slice(0, 10) : k.slice(0, 7);
}

export interface RevenueRow { period: string; paidCount: number; paidAmount: number; refundCount: number; refundAmount: number; netAmount: number; supply: number; vat: number }

/** 결제는 승인 시각, 환불은 환불 시각 기준으로 각 기간에 반영 → 순매출 = 결제 − 환불 */
export function aggregateRevenue(paid: { at: Date; amount: number }[], refunds: { at: Date; amount: number }[], by: 'day' | 'month'): RevenueRow[] {
  const m = new Map<string, RevenueRow>();
  const row = (p: string) => m.get(p) ?? m.set(p, { period: p, paidCount: 0, paidAmount: 0, refundCount: 0, refundAmount: 0, netAmount: 0, supply: 0, vat: 0 }).get(p)!;
  for (const x of paid) { const r = row(bucket(x.at, by)); r.paidCount++; r.paidAmount += x.amount; }
  for (const x of refunds) { const r = row(bucket(x.at, by)); r.refundCount++; r.refundAmount += x.amount; }
  return [...m.values()].sort((a, b) => a.period.localeCompare(b.period)).map((r) => {
    const net = r.paidAmount - r.refundAmount;
    const v = vatSplit(net);
    return { ...r, netAmount: net, supply: v.supply, vat: v.vat };
  });
}

/** CSV (엑셀 한글 호환 BOM, 값 이스케이프, 수식 주입 방지) */
export function toCsv(headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s) && typeof v === 'string') s = `'${s}`; // CSV 수식 주입 방지
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}
