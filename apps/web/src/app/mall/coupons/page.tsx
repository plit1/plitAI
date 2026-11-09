'use client';
import { useState } from 'react';
import { api, pts } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { useRequireLogin } from '@/lib/use-login';
import { Badge, ErrorBox, Spinner } from '@/components/ui';

interface Order { id: string; status: 'PENDING' | 'ISSUED' | 'FAILED' | 'CANCELLED'; price: number; createdAt: string; product: { brand: string; name: string }; couponLast4: string | null; couponExpires: string | null; isTestCoupon: boolean; failReason: string | null; cancelReason: string | null; couponCode?: string }
const ST = { PENDING: ['발급 중', 'gold'], ISSUED: ['사용 가능', 'clear'], FAILED: ['발급 실패 · 포인트 복구', 'risk'], CANCELLED: ['취소 · 포인트 복구', 'mute'] } as const;

export default function Coupons() {
  const { ready } = useRequireLogin('/mall/coupons');
  const { data, error, loading, reload } = useApi<Order[]>(ready ? '/me/mall/orders' : null);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const reveal = async (id: string) => { const o = await api<Order>(`/me/mall/orders/${id}`); if (o.couponCode) setCodes((c) => ({ ...c, [id]: o.couponCode! })); };
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">내 쿠폰</h1>
      {!ready || loading ? <Spinner /> : error ? <ErrorBox message={error.message} onRetry={reload} /> : data!.length === 0 ? <p className="card p-8 text-center text-sm text-ink-mute">교환한 쿠폰이 없어요.</p> : (
        <ul className="space-y-2">{data!.map((o) => (
          <li key={o.id} className="card flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1"><p className="text-xs text-ink-mute">{o.product.brand} · {new Date(o.createdAt).toLocaleDateString('ko-KR')} · {pts(o.price)}</p><p className="font-bold">{o.product.name}</p>
              {o.status === 'ISSUED' && <p className="font-mono text-sm">{codes[o.id] ?? `••••-${o.couponLast4}`}{o.isTestCoupon && <span className="ml-2 text-xs text-gold">테스트 쿠폰 · 실제 사용 불가</span>}</p>}
              {(o.failReason || o.cancelReason) && <p className="text-xs text-ink-mute">{o.failReason ?? o.cancelReason}</p>}</div>
            <Badge tone={ST[o.status][1]}>{ST[o.status][0]}</Badge>
            {o.status === 'ISSUED' && !codes[o.id] && <button className="text-sm font-semibold text-cobalt" onClick={() => reveal(o.id)}>코드 보기</button>}
          </li>
        ))}</ul>
      )}
    </div>
  );
}
