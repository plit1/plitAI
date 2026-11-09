import { dueExpirations, LedgerRow, lotRemaining, upcomingExpirations } from './expiry';

const d = (s: string) => new Date(s + 'T00:00:00Z');
let n = 0;
const row = (p: Partial<LedgerRow> & { amount: number }): LedgerRow => ({ id: p.id ?? `e${n++}`, type: p.type ?? (p.amount > 0 ? 'EARN' : 'SPEND'), amount: p.amount, expiresAt: p.expiresAt ?? null, createdAt: p.createdAt ?? d('2026-01-01'), reversesId: p.reversesId ?? null, refType: p.refType ?? null, refId: p.refId ?? null });

describe('포인트 만료 (선입선출)', () => {
  it('사용분은 만료가 빠른 로트부터 소진 → 남은 만료 로트만 만료', () => {
    const rows = [
      row({ id: 'late', amount: 20000, expiresAt: d('2027-06-01'), createdAt: d('2026-03-01') }),
      row({ id: 'early', amount: 3500, expiresAt: d('2026-12-01'), createdAt: d('2026-01-01') }),
      row({ amount: -2000 }),
    ];
    expect(lotRemaining(rows).map((l) => [l.id, l.remaining])).toEqual([['early', 1500], ['late', 20000]]);
    expect(dueExpirations(rows, d('2026-12-02'))).toEqual([expect.objectContaining({ id: 'early', remaining: 1500 })]);
    expect(dueExpirations(rows, d('2026-11-30'))).toEqual([]);
  });
  it('다 써버린 로트는 만료할 것이 없음, 이미 만료 처리한 로트는 재처리 안 함', () => {
    const rows = [row({ id: 'a', amount: 1000, expiresAt: d('2026-02-01') }), row({ amount: -1000 })];
    expect(dueExpirations(rows, d('2026-03-01'))).toEqual([]);
    const rows2 = [row({ id: 'b', amount: 1000, expiresAt: d('2026-02-01') }), row({ type: 'EXPIRE', amount: -1000, refType: 'POINT_ENTRY', refId: 'b' })];
    expect(dueExpirations(rows2, d('2026-03-01'))).toEqual([]);
    expect(lotRemaining(rows2)[0].remaining).toBe(0);
  });
  it('특정 로트 역분개는 그 로트에서 차감 (FIFO 아님)', () => {
    const rows = [
      row({ id: 'early', amount: 3500, expiresAt: d('2026-12-01') }),
      row({ id: 'reward', amount: 20000, expiresAt: d('2027-06-01') }),
      row({ type: 'REVERSAL', amount: -20000, reversesId: 'reward' }),
    ];
    expect(lotRemaining(rows).map((l) => l.remaining)).toEqual([3500, 0]);
  });
  it('만료 없는 로트는 마지막에 소진, 만료 예정 조회', () => {
    const rows = [row({ id: 'forever', amount: 500, expiresAt: null }), row({ id: 'soon', amount: 1000, expiresAt: d('2026-12-10') }), row({ amount: -300 })];
    expect(lotRemaining(rows).map((l) => [l.id, l.remaining])).toEqual([['soon', 700], ['forever', 500]]);
    expect(upcomingExpirations(rows, d('2026-11-20'), 30)).toEqual([expect.objectContaining({ id: 'soon', remaining: 700 })]);
    expect(upcomingExpirations(rows, d('2026-11-01'), 30)).toEqual([]);
  });
  it('남은 로트 합계 = 잔액 (불변식)', () => {
    const rows = [row({ amount: 3500, expiresAt: d('2026-05-01') }), row({ amount: 2000, expiresAt: d('2026-08-01') }), row({ amount: -4000 }), row({ amount: 20000, expiresAt: d('2027-01-01') }), row({ amount: -1500 })];
    const balance = rows.reduce((s, r) => s + r.amount, 0);
    expect(lotRemaining(rows).reduce((s, l) => s + l.remaining, 0)).toBe(balance);
  });
});
