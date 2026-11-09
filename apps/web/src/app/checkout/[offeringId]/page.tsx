'use client';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, won } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { confirmAndEnroll } from '@/lib/checkout';
import { ErrorBox, Spinner } from '@/components/ui';

interface Checkout { orderNo: string; orderName: string; amount: number; provider: 'MOCK' | 'TOSS'; clientKey: string | null; customerKey: string }
type Widgets = Awaited<ReturnType<Awaited<ReturnType<typeof import('@tosspayments/tosspayments-sdk')['loadTossPayments']>>['widgets']>>;

/**
 * 결제 화면.
 *  - MOCK: 테스트 결제 (실결제 없음) → 서버 승인
 *  - TOSS: 토스페이먼츠 결제위젯 v2 (SDK 타입 문서 기준: loadTossPayments → widgets({customerKey}) → setAmount → renderPaymentMethods/renderAgreement → requestPayment 리다이렉트)
 *    성공 시 /checkout/success 에서 서버 승인. 금액은 서버가 다시 검증.
 */
export default function CheckoutPage() {
  const { offeringId } = useParams<{ offeringId: string }>();
  const router = useRouter(); const { me, ready, reload } = useAuth();
  const [order, setOrder] = useState<Checkout | null>(null);
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const widgets = useRef<Widgets | null>(null); const [widgetReady, setWidgetReady] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!me) { router.replace(`/login?next=/checkout/${offeringId}`); return; }
    api<Checkout>('/payments/orders', { method: 'POST', json: { offeringId } }).then(setOrder).catch((e) => setError(e instanceof ApiError ? e.message : '주문을 만들지 못했어요.'));
  }, [ready, me, offeringId, router]);

  useEffect(() => {
    if (order?.provider !== 'TOSS' || !order.clientKey || widgets.current) return;
    let cancelled = false;
    (async () => {
      try {
        const { loadTossPayments } = await import('@tosspayments/tosspayments-sdk');
        const toss = await loadTossPayments(order.clientKey!);
        const w = toss.widgets({ customerKey: order.customerKey });
        await w.setAmount({ currency: 'KRW', value: order.amount });
        await Promise.all([w.renderPaymentMethods({ selector: '#payment-method' }), w.renderAgreement({ selector: '#agreement' })]);
        if (!cancelled) { widgets.current = w; setWidgetReady(true); }
      } catch (e) { if (!cancelled) setError(`결제 화면을 불러오지 못했어요. (${e instanceof Error ? e.message : 'SDK 오류'})`); }
    })();
    return () => { cancelled = true; };
  }, [order]);

  const payToss = async () => {
    if (!order || !widgets.current) return;
    setError(null);
    try {
      const q = `offering=${encodeURIComponent(offeringId)}`;
      await widgets.current.requestPayment({
        orderId: order.orderNo, orderName: order.orderName,
        successUrl: `${window.location.origin}/checkout/success?${q}`, failUrl: `${window.location.origin}/checkout/fail?${q}`,
      });
    } catch (e) { setError(e instanceof Error ? e.message : '결제를 요청하지 못했어요.'); }
  };

  const payMock = async (outcome: 'ok' | 'fail') => {
    if (!order) return;
    setBusy(true); setError(null);
    try { const next = await confirmAndEnroll(offeringId, order.orderNo, `mock_${outcome}_${order.orderNo}`, order.amount); await reload(); router.push(next); }
    catch (e) { setError(e instanceof ApiError ? e.message : '결제를 완료하지 못했어요.'); } finally { setBusy(false); }
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
      {error && <p role="alert" className="text-sm text-risk">{error}</p>}
      {order.provider === 'MOCK' ? (
        <>
          <p className="rounded-xl bg-gold-tint p-3 text-xs text-gold">테스트 결제 환경이에요. 실제로 결제되지 않아요.</p>
          <button className="btn-primary w-full" disabled={busy} onClick={() => payMock('ok')}>{busy ? '승인 중…' : `${won(order.amount)} 테스트 결제`}</button>
          <button className="btn-ghost w-full" disabled={busy} onClick={() => payMock('fail')}>결제 실패 시뮬레이션</button>
        </>
      ) : !order.clientKey ? (
        <p className="text-sm text-risk">결제 설정(클라이언트 키)이 없어요. 관리자에게 문의해주세요.</p>
      ) : (
        <>
          <div id="payment-method" aria-label="결제 수단" />
          <div id="agreement" aria-label="결제 약관" />
          {!widgetReady && <Spinner label="결제 수단 불러오는 중" />}
          <button className="btn-primary w-full" disabled={!widgetReady} onClick={payToss}>{won(order.amount)} 결제하기</button>
        </>
      )}
    </section>
  );
}
