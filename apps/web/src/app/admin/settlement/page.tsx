'use client';
import { useState } from 'react';
import { api, ApiError, currentToken, pts, won } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/use-api';
import { Spinner } from '@/components/ui';
import { AdminError, AdminShell } from '@/components/admin';

interface Row { period: string; paidCount: number; paidAmount: number; refundCount: number; refundAmount: number; netAmount: number; supply: number; vat: number }
interface Revenue { rows: Row[]; total: Omit<Row, 'period'>; note: string }
interface Points { rows: ({ period: string } & Record<string, number>)[]; outstandingBalance: number; outstandingLive: number }
const kst = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);

export default function Settlement() {
  const { me } = useAuth();
  const [f, setF] = useState({ from: kst(new Date(Date.now() - 29 * 86400000)), to: kst(new Date()), by: 'day', includeTest: false });
  const [q, setQ] = useState(f);
  const qs = `from=${q.from}&to=${q.to}&by=${q.by}&includeTest=${q.includeTest}`;
  const rev = useApi<Revenue>(`/admin/settlement/revenue?${qs}`);
  const pt = useApi<Points>(`/admin/settlement/points?from=${q.from}&to=${q.to}&by=month`);
  const [msg, setMsg] = useState<string | null>(null);
  const downloadCsv = async () => {
    const r = await fetch(`/api/v1/admin/settlement/revenue.csv?${qs}`, { headers: { Authorization: `Bearer ${currentToken()}` } });
    if (!r.ok) { setMsg('CSV 를 받지 못했어요.'); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = `plit-revenue-${q.from}_${q.to}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  const reconcile = async () => {
    try { const r = await api<{ checked: number; confirmed: number; failed: number; expired: number }>('/admin/settlement/reconcile', { method: 'POST' }); setMsg(`대사 완료 · 확인 ${r.checked} · 승인 반영 ${r.confirmed} · 실패 ${r.failed} · 만료 ${r.expired}`); rev.reload(); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : '대사를 실행하지 못했어요.'); }
  };
  const t = rev.data?.total;
  return (
    <AdminShell title="정산·매출">
      <form className="card flex flex-wrap items-end gap-2 p-4" onSubmit={(e) => { e.preventDefault(); setQ(f); }}>
        <div><label htmlFor="sf" className="label">시작일</label><input id="sf" type="date" className="input" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></div>
        <div><label htmlFor="st" className="label">종료일</label><input id="st" type="date" className="input" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></div>
        <div><label htmlFor="sb" className="label">단위</label><select id="sb" className="input" value={f.by} onChange={(e) => setF({ ...f, by: e.target.value })}><option value="day">일</option><option value="month">월</option></select></div>
        <label className="flex items-center gap-1 pb-3 text-xs"><input type="checkbox" checked={f.includeTest} onChange={(e) => setF({ ...f, includeTest: e.target.checked })} />테스트 결제 포함</label>
        <button className="btn-primary">조회</button>
        <button type="button" className="btn-ghost border border-ink-line" onClick={downloadCsv}>CSV 다운로드</button>
        {me?.role === 'SUPER_ADMIN' && <button type="button" className="btn-ghost border border-ink-line" onClick={reconcile}>결제 대사 실행</button>}
      </form>
      {msg && <p role="status" className="text-sm text-ink-soft">{msg}</p>}
      {rev.loading ? <Spinner /> : rev.error ? <AdminError code={rev.error.code} message={rev.error.message} /> : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[['순매출', won(t!.netAmount)], ['결제', `${t!.paidCount}건 · ${won(t!.paidAmount)}`], ['환불', `${t!.refundCount}건 · ${won(t!.refundAmount)}`], ['공급가 / 부가세', `${won(t!.supply)} / ${won(t!.vat)}`]].map(([k, v]) => (
              <div key={k} className="card p-4"><dt className="text-xs text-ink-mute">{k}</dt><dd className="mt-1 font-black">{v}</dd></div>
            ))}
          </dl>
          <div className="card overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-paper text-ink-mute"><tr><th className="p-2 text-left">기간</th><th className="p-2">결제</th><th className="p-2">환불</th><th className="p-2">순매출</th><th className="p-2">공급가액</th><th className="p-2">부가세</th></tr></thead>
              <tbody>{rev.data!.rows.length === 0 ? <tr><td colSpan={6} className="p-6 text-center text-ink-mute">데이터가 없어요.</td></tr> : rev.data!.rows.map((r) => (
                <tr key={r.period} className="border-t border-ink-line/60"><td className="p-2 text-left">{r.period}</td><td className="p-2">{r.paidCount}건 · {won(r.paidAmount)}</td><td className="p-2">{r.refundCount}건 · {won(r.refundAmount)}</td><td className="p-2 font-semibold">{won(r.netAmount)}</td><td className="p-2">{won(r.supply)}</td><td className="p-2">{won(r.vat)}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <p className="text-[11px] text-ink-mute">{rev.data!.note} 결제는 승인일, 환불은 환불일(한국 시간) 기준이에요.</p>
        </>
      )}
      <section className="card p-4" aria-label="포인트">
        <h2 className="text-sm font-bold">포인트</h2>
        {pt.data && <p className="mt-1 text-sm">미사용 잔액 {pts(pt.data.outstandingBalance)} · 실제 가치 포인트 {pts(pt.data.outstandingLive)}</p>}
        <ul className="mt-2 space-y-1 text-xs text-ink-soft">{pt.data?.rows.map((r) => <li key={r.period}>{r.period}: 적립 {pts(r.EARN)} · 사용 {pts(r.SPEND)} · 만료 {pts(r.EXPIRE)} · 조정 {pts(r.ADJUST)}</li>)}</ul>
      </section>
    </AdminShell>
  );
}
