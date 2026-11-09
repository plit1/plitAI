'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

/** 토스 failUrl: ?code&message&orderId. 결제는 진행되지 않음 — 주문은 서버 대사에서 24시간 후 자동 만료 */
function Fail() {
  const sp = useSearchParams();
  const offering = sp.get('offering');
  return (
    <div role="alert" className="card mx-auto max-w-md space-y-3 p-6">
      <h1 className="text-lg font-black">결제가 완료되지 않았어요</h1>
      <p className="text-sm text-ink-soft">{sp.get('message') ?? '결제가 취소되었거나 실패했어요.'}</p>
      {sp.get('code') && <p className="font-mono text-xs text-ink-mute">{sp.get('code')} · {sp.get('orderId')}</p>}
      <div className="flex gap-2">
        {offering && <Link className="btn-primary" href={`/checkout/${encodeURIComponent(offering)}`}>다시 결제하기</Link>}
        <Link className="btn-ghost border border-ink-line" href="/my">내 챌린지로</Link>
      </div>
    </div>
  );
}
export default function Page() { return <Suspense><Fail /></Suspense>; }
