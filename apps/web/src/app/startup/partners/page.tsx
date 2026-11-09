'use client';
import { useApi } from '@/lib/use-api';
import { Badge, ErrorBox, Spinner } from '@/components/ui';
import { Meta, StartupNav } from '@/components/startup';

export default function Partners() {
  const { data, error, loading, reload } = useApi<Meta>('/startup/meta');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2"><h1 className="text-2xl font-black">창업 파트너</h1><StartupNav /></div>
      <p role="note" className="rounded-xl bg-gold-tint p-3 text-sm text-gold">아래 업체는 화면 구성을 보여주기 위한 <b>예시</b>예요. 실제 제휴가 확정되면 검증된 파트너로 교체되며, 그 전에는 상담 신청을 받지 않아요.</p>
      {loading ? <Spinner /> : error ? <ErrorBox message={error.message} onRetry={reload} /> : (
        <ul className="grid gap-3 sm:grid-cols-2">{data!.partners.map((p) => (
          <li key={p.id} className="card space-y-1 p-4"><div className="flex gap-1"><Badge tone="mute">{p.categoryLabel}</Badge><Badge tone="mute">예시</Badge></div>
            <p className="font-bold">{p.name}</p><p className="text-sm text-ink-soft">{p.headline}</p><p className="text-xs text-ink-mute">{p.regions.join(' · ')} · {p.desc}</p></li>
        ))}</ul>
      )}
    </div>
  );
}
