'use client';
import { useState } from 'react';
import { api, ApiError, pts } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/use-api';
import { Badge, Spinner } from '@/components/ui';
import { AdminError, AdminShell, fmtDate } from '@/components/admin';

interface Product { id: string; category: string; brand: string; name: string; price: number; stock: number | null; perUserDaily: number; supplier: string; status: 'ACTIVE' | 'HIDDEN'; isDemo: boolean; sortOrder: number }
interface Order { id: string; status: string; price: number; createdAt: string; product: { brand: string; name: string }; userId: string; supplier: string; isTestCoupon: boolean }

export default function AdminMall() {
  const { me } = useAuth();
  const products = useApi<Product[]>('/admin/mall/products');
  const orders = useApi<Order[]>('/admin/mall/orders');
  const suppliers = useApi<{ id: string; status: string; realValue: boolean }[]>('/admin/mall/suppliers');
  const [err, setErr] = useState<{ code?: string; message: string } | null>(null); const [ok, setOk] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, msg: string) => { setErr(null); setOk(null); try { await fn(); setOk(msg); products.reload(); orders.reload(); } catch (e) { setErr(e instanceof ApiError ? e : { message: '처리하지 못했어요.' }); } };
  const edit = (p: Product) => {
    const price = window.prompt(`${p.name} 가격(P)`, String(p.price)); if (price === null) return;
    const stock = window.prompt('재고 (비우면 무제한)', p.stock === null ? '' : String(p.stock)); if (stock === null) return;
    run(() => api('/admin/mall/products', { method: 'PUT', json: { ...p, price: Number(price), stock: stock === '' ? null : Number(stock) } }), '상품을 저장했어요.');
  };
  const toggle = (p: Product) => run(() => api('/admin/mall/products', { method: 'PUT', json: { ...p, status: p.status === 'ACTIVE' ? 'HIDDEN' : 'ACTIVE' } }), '상태를 바꿨어요.');
  const cancel = (o: Order) => { const reason = window.prompt('취소 사유 (포인트가 복구돼요)'); if (reason) run(() => api(`/admin/mall/orders/${o.id}/cancel`, { method: 'POST', json: { reason } }), '교환을 취소했어요.'); };
  const superAdmin = me?.role === 'SUPER_ADMIN';
  return (
    <AdminShell title="포인트몰">
      <ul className="flex flex-wrap gap-2 text-xs">{suppliers.data?.map((s) => <li key={s.id} className="card px-3 py-2"><span className="font-semibold">{s.id}</span> <Badge tone={s.status === 'ACTIVE' ? 'clear' : 'mute'}>{s.status}</Badge>{!s.realValue && <span className="ml-1 text-ink-mute">테스트 쿠폰</span>}</li>)}</ul>
      {ok && <p role="status" className="text-sm text-clear-deep">{ok}</p>}
      {err && <AdminError code={err.code} message={err.message} />}
      <section aria-labelledby="prods"><h2 id="prods" className="mb-2 text-sm font-bold">상품 {superAdmin ? '' : '(수정은 최고 관리자)'}</h2>
        {products.loading ? <Spinner /> : (
          <div className="card overflow-x-auto"><table className="w-full text-left text-xs">
            <thead className="bg-paper text-ink-mute"><tr><th className="p-2">상품</th><th className="p-2">가격</th><th className="p-2">재고</th><th className="p-2">1인/일</th><th className="p-2">공급사</th><th className="p-2">상태</th><th /></tr></thead>
            <tbody>{products.data?.map((p) => (
              <tr key={p.id} className="border-t border-ink-line/60"><td className="p-2"><b>{p.brand}</b> {p.name} {p.isDemo && <Badge tone="mute">예시</Badge>}</td><td className="p-2">{pts(p.price)}</td><td className="p-2">{p.stock ?? '∞'}</td><td className="p-2">{p.perUserDaily}</td><td className="p-2">{p.supplier}</td><td className="p-2">{p.status}</td>
                <td className="whitespace-nowrap p-2">{superAdmin && <><button className="text-cobalt" onClick={() => edit(p)}>수정</button> · <button className="text-ink-soft" onClick={() => toggle(p)}>{p.status === 'ACTIVE' ? '숨김' : '노출'}</button></>}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      <section aria-labelledby="ords"><h2 id="ords" className="mb-2 text-sm font-bold">교환 내역</h2>
        {orders.loading ? <Spinner /> : (
          <div className="card overflow-x-auto"><table className="w-full text-left text-xs">
            <thead className="bg-paper text-ink-mute"><tr><th className="p-2">일시</th><th className="p-2">상품</th><th className="p-2">포인트</th><th className="p-2">상태</th><th /></tr></thead>
            <tbody>{orders.data!.length === 0 ? <tr><td colSpan={5} className="p-6 text-center text-ink-mute">교환 내역이 없어요.</td></tr> : orders.data!.map((o) => (
              <tr key={o.id} className="border-t border-ink-line/60"><td className="p-2">{fmtDate(o.createdAt)}</td><td className="p-2">{o.product?.brand} {o.product?.name}</td><td className="p-2">{pts(o.price)}</td><td className="p-2">{o.status}{o.isTestCoupon ? ' (테스트)' : ''}</td>
                <td className="p-2">{o.status === 'ISSUED' && <button className="text-risk" onClick={() => cancel(o)}>취소</button>}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </AdminShell>
  );
}
