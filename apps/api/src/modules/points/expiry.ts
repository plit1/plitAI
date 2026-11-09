import { PointEntryType } from '@prisma/client';

/**
 * 포인트 만료 계산 (순수 함수).
 *  - 적립 로트(양수 항목)는 만료일이 빠른 것부터 먼저 소진 (회원에게 유리한 선입선출)
 *  - 특정 로트를 겨냥한 역분개(reversesId)·만료(refId) 는 그 로트에서 직접 차감
 *  - 그 외 차감(사용·음수 조정 등)은 만료일 순으로 배분
 *  - now 기준 만료일이 지났고 남은 금액이 있으며 아직 만료 처리되지 않은 로트 → 만료 대상
 */
export interface LedgerRow { id: string; type: PointEntryType; amount: number; expiresAt: Date | null; createdAt: Date; reversesId: string | null; refType: string | null; refId: string | null }

export function lotRemaining(rows: LedgerRow[]) {
  const lots = rows.filter((r) => r.amount > 0).sort((a, b) => (a.expiresAt?.getTime() ?? Infinity) - (b.expiresAt?.getTime() ?? Infinity) || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  const left = new Map(lots.map((l) => [l.id, l.amount]));
  let pool = 0;
  for (const r of rows) {
    if (r.amount >= 0) continue;
    const target = r.reversesId ?? (r.type === 'EXPIRE' && r.refType === 'POINT_ENTRY' ? r.refId : null);
    if (target && left.has(target)) {
      const take = Math.min(left.get(target)!, -r.amount);
      left.set(target, left.get(target)! - take);
      pool += -r.amount - take; // 로트 잔액을 넘는 부분은 일반 차감으로
    } else pool += -r.amount;
  }
  for (const l of lots) {
    if (pool <= 0) break;
    const take = Math.min(left.get(l.id)!, pool);
    left.set(l.id, left.get(l.id)! - take);
    pool -= take;
  }
  return lots.map((l) => ({ id: l.id, type: l.type, amount: l.amount, expiresAt: l.expiresAt, remaining: left.get(l.id)! }));
}

export function dueExpirations(rows: LedgerRow[], now: Date) {
  const expired = new Set(rows.filter((r) => r.type === 'EXPIRE' && r.refType === 'POINT_ENTRY' && r.refId).map((r) => r.refId!));
  return lotRemaining(rows).filter((l) => l.expiresAt && l.expiresAt <= now && l.remaining > 0 && !expired.has(l.id));
}

export function upcomingExpirations(rows: LedgerRow[], now: Date, withinDays: number) {
  const until = new Date(now.getTime() + withinDays * 86400000);
  return lotRemaining(rows).filter((l) => l.expiresAt && l.expiresAt > now && l.expiresAt <= until && l.remaining > 0);
}
