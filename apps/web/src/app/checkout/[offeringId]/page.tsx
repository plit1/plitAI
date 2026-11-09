'use client';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError, won } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ErrorBox, Spinner } from '@/components/ui';

interface Checkout { orderNo: string; orderName: string; amount: number; provider: 'MOCK' | 'TOSS'; clientKey: string | null; customerKey: string }

/**
 * 결제 화면.
 *  - MOCK: 테스트 결제 (실제 결제 없음). 결과 선택 → 서버 승인 API 호출
 *  - TOSS: 토스 결제위젯 연동 지점 (가맹 계약·클라이언트 키 발급 후 활성화) — 위젯 successUrl 에서도 동일하게 /payments/confirm 호출
 */
export default function CheckoutPage() {
  const { offeringId } = useParams<{ offeringId: string }>();
  const router = useRouter(); const { me, ready, reload } = useAuth();
  const [order, setOrder] = useState<Checkout | null>(null);
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!me) { router.replace(`/login?next=/checkout/${offeringId}`); return; }
    api<Checkout>('/payments/orders', { method: 'POST', json: { offeringId } }).then(setOrder).catch((e) => setError(e instanceof ApiError ? e.message : '주문을 만들지 못했어요.'));
  }, [ready, me, offeringId, router]);

  const pay = async (outcome: 'ok' | 'fail') => {
    if (!order) return;
    setBusy(true); setError(null);
    try {
      const paymentKey = `mock_${outcome}_${order.orderNo}`;
      await api('/payments/confirm', { method: 'POST', json: { orderNo: order.orderNo, paymentKey, amount: order.amount } });
      const mine = await api<{ id: string; offering: { id: string } }[]>('/me/enrollments');
      let enr = mine.find((e) => e.offering.id === offeringId);
      if (!enr) {
        const j = await api<{ enrollment: { id: string } }>(`/challenges/${offeringId}/join`, { method: 'POST', json: { plan: 'PREMIUM' } });
        enr = { id: j.enrollment.id, offering: { id: offeringId } };
      }
      await reload();
      router.push(`/dashboard/${enr.id}?paid=1`);
    } catch (e) { setError(e instanceof ApiError ? e.message : '결제를 완료하지 못했어요.'); } finally { setBusy(false); }
  };

  if (error && !order) return <ErrorBox message={error} />;
  if (!order) return <Spinner label="주문 준비 중" />;
  return (
    <section className="card mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-xl font-black">결제하기</h1>
      <dl className="space-y-2 rounded-xl bg-paper p-4 text-sm">
        <div className="flex justify-between"><dt className="text-ink-mute">상품</dt><dd className="text-right font-semibold">{order.orderName}</dd></div>
        <div className="flex justify-between"><dt className="text-ink-mute">주문번호</dt><dd className="font-mono text-xs">{order.orderNo}</dd></div>
        <div className="flex justify-between text-base"><dt className="font-bold">결제 금액</dt><dd className="font-black text-cobalt">{won(order.amount)}</dd></div>
      </dl>
      {order.provider === 'MOCK' ? (
        <>
          <p className="rounded-xl bg-gold-tint p-3 text-xs text-gold">테스트 결제 환경이에요. 실제로 결제되지 않아요.</p>
          {error && <p role="alert" className="text-sm text-risk">{error}</p>}
          <button className="btn-primary w-full" disabled={busy} onClick={() => pay('ok')}>{busy ? '승인 중…' : `${won(order.amount)} 테스트 결제`}</button>
          <button className="btn-ghost w-full" disabled={busy} onClick={() => pay('fail')}>결제 실패 시뮬레이션</button>
        </>
      ) : (
        <p className="text-sm text-ink-soft">토스페이먼츠 결제위젯은 가맹 계약 후 활성화돼요.</p>
      )}
    </section>
  );
}
