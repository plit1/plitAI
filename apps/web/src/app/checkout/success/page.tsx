'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { confirmAndEnroll } from '@/lib/checkout';
import { Spinner } from '@/components/ui';

/** 토스 successUrl: ?paymentType&amount&orderId&paymentKey (+ 우리가 붙인 offering). 서버가 금액을 다시 검증하고 승인 */
function Success() {
  const sp = useSearchParams(); const router = useRouter(); const { me, ready, reload } = useAuth();
  const [err, setErr] = useState<string | null>(null); const done = useRef(false);
  useEffect(() => {
    if (!ready || done.current) return;
    if (!me) { setErr('로그인이 만료됐어요. 다시 로그인하면 결제 확인을 이어서 진행할 수 있어요.'); return; }
    const offering = sp.get('offering'), orderId = sp.get('orderId'), paymentKey = sp.get('paymentKey'), amount = Number(sp.get('amount'));
    if (!offering || !orderId || !paymentKey || !Number.isInteger(amount)) { setErr('결제 정보가 올바르지 않아요.'); return; }
    done.current = true; // 새로고침·이중 렌더에도 승인 요청은 1회 (서버도 멱등)
    confirmAndEnroll(offering, orderId, paymentKey, amount).then(async (next) => { await reload(); router.replace(next); })
      .catch((e) => setErr(e instanceof ApiError ? e.message : '결제를 확인하지 못했어요. 결제 내역을 확인해주세요.'));
  }, [ready, me, sp, reload, router]);
  if (err) return <div role="alert" className="card mx-auto max-w-md space-y-3 p-6"><h1 className="text-lg font-black">결제 확인 실패</h1><p className="text-sm text-risk">{err}</p><Link className="btn-ghost border border-ink-line" href="/my">내 챌린지로</Link></div>;
  return <Spinner label="결제를 확인하고 있어요" />;
}
export default function Page() { return <Suspense><Success /></Suspense>; }
