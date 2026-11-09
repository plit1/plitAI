'use client';
import { useApi } from '@/lib/use-api';
import { Badge, ErrorBox, Spinner } from '@/components/ui';
import { Meta, StartupNav } from '@/components/startup';

export default function Market() {
  const { data, error, loading, reload } = useApi<Meta>('/startup/meta');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2"><h1 className="text-2xl font-black">상권 정보</h1><StartupNav /></div>
      <p className="text-sm text-ink-soft">점포 위치를 고르기 전에 공식 상권 데이터를 확인하세요. PLIT 화면 안의 상권 분석은 공공데이터 연동 승인 후 제공할 예정이에요.</p>
      {loading ? <Spinner /> : error ? <ErrorBox message={error.message} onRetry={reload} /> : (
        <ul className="space-y-2">{data!.market.map((s) => (
          <li key={s.id} className="card flex flex-wrap items-center gap-2 p-4">
            <div className="min-w-0 flex-1"><p className="font-bold">{s.name}</p><p className="text-xs text-ink-soft">{s.note}</p></div>
            <Badge tone={s.status === 'LINK_ONLY' ? 'cobalt' : 'mute'}>{s.status === 'LINK_ONLY' ? '공식 사이트' : '연동 준비 중'}</Badge>
            <a className="text-sm font-semibold text-cobalt" href={s.url} target="_blank" rel="noopener noreferrer">열기 ↗</a>
          </li>
        ))}</ul>
      )}
    </div>
  );
}
