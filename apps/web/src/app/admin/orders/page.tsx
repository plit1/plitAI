'use client';
import { useState } from 'react';
import { api, ApiError, won } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/use-api';
import { Badge, Spinner } from '@/components/ui';
import { AdminError, AdminShell, fmtDateTime } from '@/components/admin';

interface Order { id: string; orderNo: string; productName: string; amount: number; status: string; pgProvider: string; isTest: boolean; approvedAt: string | null; createdAt: string; failReason: string | null; user: { nickname: string }; events: { type: string; createdAt: string }[] }
const TONE: Record<string, 'clear' | 'risk' | 'mute' | 'gold'> = { PAID: 'clear', REFUNDED: 'gold', FAILED: 'risk', CANCELLED: 'mute', PENDING: 'mute' };

export default function Orders() {
  const { me } = useAuth();
  const [status, setStatus] = useState('');
  const list = useApi<Order[]>(`/admin/orders${status ? `?status=${status}` : ''}`);
  const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<{ code?: string; message: string } | null>(null);
  const refund = async (o: Order) => {
    const reason = window.prompt(`${o.orderNo} (${won(o.amount)}) 환불 사유`); if (!reason) return;
    setErr(null); setMsg(null);
    try { await api(`/admin/orders/${o.orderNo}/refund`, { method: 'POST', json: { reason } }); setMsg(`${o.orderNo} 환불 완료`); list.reload(); }
    catch (e) { setErr(e instanceof ApiError ? e : { message: '환불하지 못했어요.' }); }
  };
  return (
    <AdminShell title="결제·환불">
      <div className="flex flex-wrap gap-1" role="group" aria-label="상태 필터">{['', 'PAID', 'PENDING', 'FAILED', 'REFUNDED', 'CANCELLED'].map((s) => (
        <button key={s} aria-pressed={status === s} onClick={() => setStatus(s)} className={`rounded-full px-3 py-1 text-xs ${status === s ? 'bg-ink text-white' : 'border border-ink-line text-ink-soft'}`}>{s || '전체'}</button>
      ))}</div>
      {msg && <p role="status" className="text-sm text-clear-deep">{msg}</p>}{err && <AdminError code={err.code} message={err.message} />}
      {list.loading ? <Spinner /> : list.error ? <AdminError code={list.error.code} message={list.error.message} /> : (
        <ul className="space-y-2">{list.data!.map((o) => (
          <li key={o.id} className="card p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold">{won(o.amount)} <Badge tone={TONE[o.status] ?? 'mute'}>{o.status}</Badge> {o.isTest && <Badge tone="mute">TEST · {o.pgProvider}</Badge>}</p>
              {o.status === 'PAID' && me?.role === 'SUPER_ADMIN' && <button className="btn-ghost px-3 py-1.5 text-risk" onClick={() => refund(o)}>환불</button>}
            </div>
            <p className="text-xs text-ink-soft">{o.productName} · {o.user.nickname}</p>
            <p className="text-xs text-ink-mute"><span className="font-mono">{o.orderNo}</span> · 생성 {fmtDateTime(o.createdAt)}{o.approvedAt && ` · 승인 ${fmtDateTime(o.approvedAt)}`}</p>
            {o.failReason && <p className="text-xs text-risk">{o.failReason}</p>}
            {o.events.length > 0 && <p className="mt-1 text-[11px] text-ink-mute">이벤트: {o.events.map((e) => e.type).join(' → ')}</p>}
          </li>
        ))}</ul>
      )}
    </AdminShell>
  );
}
