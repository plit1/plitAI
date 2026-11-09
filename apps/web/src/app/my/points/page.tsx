'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { pts } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/use-api';
import { ErrorBox, Spinner } from '@/components/ui';

interface Entry { id: string; type: string; amount: number; balanceAfter: number; reason: string; createdAt: string; isVirtual: boolean }
export default function Points() {
  const { me, ready } = useAuth(); const router = useRouter();
  useEffect(() => { if (ready && !me) router.replace('/login?next=/my/points'); }, [ready, me, router]);
  const { data, error, loading, reload } = useApi<{ items: Entry[] }>(me ? '/me/points/history' : null);
  if (!me) return <Spinner />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">포인트 내역</h1>
      <p className="card p-5 text-lg font-black">잔액 {pts(me.points)}</p>
      <p className="text-xs text-ink-mute">현재 포인트는 테스트용 가상 포인트예요. 정식 보상 정책 확정 후 전환돼요.</p>
      {loading ? <Spinner /> : error ? <ErrorBox message={error.message} onRetry={reload} /> : (
        <ul className="card divide-y divide-ink-line/70">{data!.items.map((e) => (
          <li key={e.id} className="flex items-center justify-between p-4 text-sm">
            <div><p className="font-semibold">{e.reason}</p><p className="text-xs text-ink-mute">{new Date(e.createdAt).toLocaleString('ko-KR')}</p></div>
            <div className="text-right"><p className={`font-bold ${e.amount >= 0 ? 'text-clear-deep' : 'text-risk'}`}>{e.amount >= 0 ? '+' : ''}{pts(e.amount)}</p><p className="text-xs text-ink-mute">잔액 {pts(e.balanceAfter)}</p></div>
          </li>
        ))}</ul>
      )}
    </div>
  );
}
