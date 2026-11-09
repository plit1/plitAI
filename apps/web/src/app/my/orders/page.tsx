'use client';
import { useState } from 'react';
import { api, ApiError, won } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/use-api';
import { Badge, ErrorBox, Spinner } from '@/components/ui';

interface Order { orderNo: string; productName: string; amount: number; status: string; approvedAt: string | null; refundedAmount: number; createdAt: string; pass: { status: string; expiresAt: string } | null }
const LABEL: Record<string, [string, 'clear' | 'mute' | 'risk' | 'gold']> = { PAID: ['결제 완료', 'clear'], PENDING: ['결제 대기', 'mute'], FAILED: ['실패', 'risk'], CANCELLED: ['취소', 'mute'], REFUNDED: ['환불 완료', 'gold'] };

export default function Orders() {
  const { me, reload: reloadMe } = useAuth();
  const list = useApi<Order[]>(me ? '/payments/me/orders' : null);
  const policy = useApi<{ refundDays: number }>('/policy/plans');
  const [msg, setMsg] = useState<string | null>(null);
  const refund = async (o: Order) => {
    if (!window.confirm(`${won(o.amount)} 결제를 환불할까요? 플릿 부스터 패스가 회수되고 플릿런으로 전환돼요.`)) return;
    setMsg(null);
    try { await api(`/payments/orders/${o.orderNo}/refund`, { method: 'POST' }); setMsg('환불을 완료했어요.'); list.reload(); reloadMe(); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : '환불하지 못했어요.'); }
  };
  if (!me) return <Spinner />;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-black">결제 내역</h1>
      {policy.data && <p className="text-xs text-ink-mute">결제 후 {policy.data.refundDays}일 이내에는 직접 환불할 수 있어요. 그 이후에는 고객센터로 문의해주세요.</p>}
      {msg && <p role="status" className="rounded-xl bg-paper p-3 text-sm">{msg}</p>}
      {list.loading ? <Spinner /> : list.error ? <ErrorBox message={list.error.message} /> : list.data!.length === 0 ? <p className="card p-8 text-center text-sm text-ink-mute">결제 내역이 없어요.</p> : (
        <ul className="space-y-2">{list.data!.map((o) => {
          const [label, tone] = LABEL[o.status] ?? [o.status, 'mute'];
          const days = o.approvedAt ? (Date.now() - Date.parse(o.approvedAt)) / 86400000 : Infinity;
          const canRefund = o.status === 'PAID' && days <= (policy.data?.refundDays ?? 7);
          return (
            <li key={o.orderNo} className="card flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
              <div>
                <p className="font-bold">{o.productName} <Badge tone={tone}>{label}</Badge></p>
                <p className="text-xs text-ink-mute">{won(o.amount)} · {new Date(o.approvedAt ?? o.createdAt).toLocaleString('ko-KR')} · <span className="font-mono">{o.orderNo}</span></p>
                {o.pass && <p className="text-xs text-ink-soft">이용권 {o.pass.status === 'ACTIVE' ? `사용 중 · ${new Date(o.pass.expiresAt).toLocaleDateString('ko-KR')}까지` : '회수됨'}</p>}
              </div>
              {canRefund && <button className="btn-ghost border border-ink-line px-3 py-2 text-risk" onClick={() => refund(o)}>환불 요청</button>}
            </li>
          );
        })}</ul>
      )}
    </div>
  );
}
