'use client';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { notifyUnreadChanged } from '@/lib/notify';
import { useApi } from '@/lib/use-api';
import { useRequireLogin } from '@/lib/use-login';
import { ErrorBox, Spinner } from '@/components/ui';

interface N { id: string; type: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string }

export default function Notifications() {
  const { ready } = useRequireLogin('/notifications'); const router = useRouter();
  const { data, error, loading, reload, setData } = useApi<{ items: N[]; unread: number }>(ready ? '/me/notifications' : null);
  const open = async (n: N) => {
    if (!n.readAt) { await api(`/me/notifications/${n.id}/read`, { method: 'PUT' }); notifyUnreadChanged(); }
    if (n.link) router.push(n.link); else reload();
  };
  const readAll = async () => { await api('/me/notifications/read-all', { method: 'POST' }); notifyUnreadChanged(); setData(data && { ...data, unread: 0, items: data.items.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })) }); };
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between"><h1 className="text-2xl font-black">알림</h1>{data && data.unread > 0 && <button className="text-sm font-semibold text-cobalt" onClick={readAll}>모두 읽음</button>}</div>
      {!ready || loading ? <Spinner /> : error ? <ErrorBox message={error.message} onRetry={reload} /> : data!.items.length === 0 ? <p className="card p-8 text-center text-sm text-ink-mute">새 알림이 없어요.</p> : (
        <ul className="space-y-2">{data!.items.map((n) => (
          <li key={n.id}><button onClick={() => open(n)} className={`card block w-full p-4 text-left ${n.readAt ? 'opacity-70' : 'border-cobalt/40'}`} data-testid="notification">
            <p className="flex items-center gap-2 font-bold">{!n.readAt && <span className="h-2 w-2 rounded-full bg-cobalt" aria-label="읽지 않음" />}{n.title}</p>
            <p className="text-sm text-ink-soft">{n.body}</p><p className="text-xs text-ink-mute">{new Date(n.createdAt).toLocaleString('ko-KR')}</p>
          </button></li>
        ))}</ul>
      )}
      <p className="text-xs text-ink-mute">알림은 PLIT 안에서만 보여드려요. 이메일·푸시 알림은 준비 중이에요.</p>
    </div>
  );
}
