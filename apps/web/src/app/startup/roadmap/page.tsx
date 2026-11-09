'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { useRequireLogin } from '@/lib/use-login';
import { ErrorBox, Spinner } from '@/components/ui';
import { StartupNav } from '@/components/startup';
import type { SProfile } from '../page';

export default function Roadmap() {
  const { ready } = useRequireLogin('/startup/roadmap');
  const { data, error, loading, reload, setData } = useApi<SProfile>(ready ? '/me/startup-profile' : null);
  const [err, setErr] = useState<string | null>(null);
  const toggle = async (id: string, done: boolean) => {
    setErr(null);
    const prev = data!;
    const roadmap = prev.roadmap.map((t) => (t.id === id ? { ...t, done } : t));
    setData({ ...prev, roadmap, progress: { ...prev.progress, done: roadmap.filter((t) => t.done).length } }); // 즉시 반영 후 서버 값으로 확정
    try { setData(await api<SProfile>(`/me/startup-profile/roadmap/${id}`, { method: 'PUT', json: { done } })); } catch (e) { setData(prev); setErr(e instanceof ApiError ? e.message : '잠시 후 다시 시도해주세요.'); }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2"><h1 className="text-2xl font-black">창업 로드맵</h1><StartupNav /></div>
      {!ready || loading ? <Spinner /> : error ? <ErrorBox message={error.message} onRetry={reload} /> : (
        <>
          <div className="h-2 overflow-hidden rounded-full bg-ink-line" role="progressbar" aria-label="로드맵 진행" aria-valuenow={data!.progress.done} aria-valuemin={0} aria-valuemax={data!.progress.total}><div className="h-full bg-clear" style={{ width: `${(data!.progress.done / data!.progress.total) * 100}%` }} /></div>
          <p className="text-sm text-ink-soft" data-testid="roadmap-progress">{data!.progress.done}/{data!.progress.total} 단계 완료</p>
          <ol className="space-y-2">{data!.roadmap.map((t, i) => (
            <li key={t.id} className="card flex items-start gap-3 p-4">
              <input id={`t-${t.id}`} type="checkbox" className="mt-1 h-5 w-5 accent-cobalt" checked={t.done} onChange={(e) => toggle(t.id, e.target.checked)} />
              <div className="min-w-0 flex-1"><label htmlFor={`t-${t.id}`} className={`font-bold ${t.done ? 'text-ink-mute line-through' : ''}`}>{i + 1}. {t.title}</label><p className="text-sm text-ink-soft">{t.desc}</p></div>
              {t.path && <Link href={t.path} className="shrink-0 text-xs font-semibold text-cobalt">바로가기 →</Link>}
            </li>
          ))}</ol>
          {err && <p role="alert" className="text-sm text-risk">{err}</p>}
        </>
      )}
    </div>
  );
}
