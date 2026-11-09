'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError, pts } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/use-api';
import { Badge, Chip, ErrorBox, Spinner } from '@/components/ui';

interface Product { id: string; category: string; brand: string; name: string; price: number; soldOut: boolean; isDemo: boolean; testCoupon: boolean }
interface Order { id: string; status: string; couponCode?: string; isTestCoupon: boolean; product?: { brand: string; name: string } }

export default function Mall() {
  const { me, reload: reloadMe } = useAuth(); const router = useRouter();
  const [cat, setCat] = useState('');
  const { data, error, loading, reload } = useApi<{ categories: { id: string; label: string }[]; items: Product[]; notice: string }>(`/mall/products${cat ? `?category=${cat}` : ''}`);
  const [pick, setPick] = useState<{ p: Product; key: string } | null>(null);
  const [result, setResult] = useState<Order | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const balance = me?.points ?? 0;
  const open = (p: Product) => { if (!me) return router.push('/login?next=/mall'); setPick({ p, key: `mall_${crypto.randomUUID().replace(/-/g, '')}` }); setResult(null); setErr(null); };
  const exchange = async () => {
    if (!pick) return; setBusy(true); setErr(null);
    try { setResult(await api<Order>('/mall/exchange', { method: 'POST', json: { productId: pick.p.id, idempotencyKey: pick.key } })); await reloadMe(); reload(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : '잠시 후 다시 시도해주세요.'); await reloadMe(); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-black">포인트몰</h1>
        <div className="flex items-center gap-3 text-sm">{me && <span>보유 <b className="text-clear-deep">{pts(balance)}</b></span>}<Link href="/mall/coupons" className="font-semibold text-cobalt">내 쿠폰</Link></div>
      </div>
      {data && <p role="note" className="rounded-xl bg-gold-tint p-3 text-sm text-gold">{data.notice}</p>}
      {data && <div className="flex flex-wrap gap-1"><Chip on={!cat} onClick={() => setCat('')}>전체</Chip>{data.categories.map((c) => <Chip key={c.id} on={cat === c.id} onClick={() => setCat(c.id)}>{c.label}</Chip>)}</div>}
      {loading ? <Spinner /> : error ? <ErrorBox message={error.message} onRetry={reload} /> : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">{data!.items.map((p) => (
          <li key={p.id} className="card flex flex-col p-4" data-testid="product">
            <div className="flex gap-1">{p.testCoupon && <Badge tone="mute">테스트 쿠폰</Badge>}{p.soldOut && <Badge tone="risk">품절</Badge>}</div>
            <p className="mt-2 text-xs text-ink-mute">{p.brand}</p>
            <h2 className="text-sm font-semibold leading-snug">{p.name}</h2>
            <p className="mt-1 text-lg font-black">{pts(p.price)}</p>
            <button className={`mt-auto pt-2 ${me && balance < p.price ? 'btn-ghost border border-ink-line' : 'btn-primary'}`} disabled={p.soldOut} onClick={() => open(p)}>{me && balance < p.price ? `${pts(p.price - balance)} 부족` : '교환하기'}</button>
          </li>
        ))}</ul>
      )}
      {pick && (
        <div role="dialog" aria-modal="true" aria-labelledby="ex-title" className="fixed inset-0 z-30 grid place-items-center bg-night/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setPick(null); }}>
          <div className="card w-full max-w-sm space-y-3 p-5">
            <h2 id="ex-title" className="text-lg font-black">{result ? '교환 완료' : '포인트 교환'}</h2>
            {result?.status === 'ISSUED' ? (
              <div className="space-y-2 text-center">
                <div className="rounded-2xl border-2 border-dashed border-ink-line p-4"><p className="text-sm text-ink-soft">{pick.p.brand} · {pick.p.name}</p><p className="mt-2 font-mono text-lg font-black tracking-wider" data-testid="coupon-code">{result.couponCode}</p>{result.isTestCoupon && <p className="mt-1 text-xs font-semibold text-gold">테스트 쿠폰 · 실제 사용 불가</p>}</div>
                <div className="grid grid-cols-2 gap-2"><button className="btn-ghost border border-ink-line" onClick={() => setPick(null)}>닫기</button><Link href="/mall/coupons" className="btn-primary justify-center">내 쿠폰 보기</Link></div>
              </div>
            ) : (
              <>
                <p className="font-semibold">{pick.p.brand} · {pick.p.name}</p>
                <dl className="space-y-1 text-sm"><div className="flex justify-between"><dt>보유</dt><dd>{pts(balance)}</dd></div><div className="flex justify-between"><dt>사용</dt><dd>-{pts(pick.p.price)}</dd></div><div className="flex justify-between border-t border-ink-line pt-1 font-bold"><dt>교환 후 잔액</dt><dd className={balance < pick.p.price ? 'text-risk' : ''}>{balance < pick.p.price ? '부족' : pts(balance - pick.p.price)}</dd></div></dl>
                {err && <p role="alert" className="text-sm text-risk">{err}</p>}
                <button className="btn-primary w-full" disabled={busy || balance < pick.p.price} onClick={exchange}>{balance < pick.p.price ? '포인트가 부족해요' : `${pts(pick.p.price)} 교환하기`}</button>
                <button className="btn-ghost w-full" onClick={() => setPick(null)}>취소</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
