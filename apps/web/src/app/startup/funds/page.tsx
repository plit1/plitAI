'use client';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/use-api';
import { ErrorBox, Spinner } from '@/components/ui';
import { Meta, StartupNav } from '@/components/startup';

export default function Funds() {
  const { me } = useAuth();
  const meta = useApi<Meta>('/startup/meta');
  const prof = useApi<{ sido: string }>(me ? '/me/startup-profile' : null);
  if (meta.loading) return <Spinner />;
  if (meta.error) return <ErrorBox message={meta.error.message} onRetry={meta.reload} />;
  const m = meta.data!; const mine = prof.data?.sido;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2"><h1 className="text-2xl font-black">자금·보증</h1><StartupNav /></div>
      <section className="card space-y-2 p-5"><h2 className="text-sm font-bold">지원 유형 알아보기</h2>
        <ul className="grid gap-2 sm:grid-cols-2">{Object.entries(m.supportTypes).map(([k, v]) => <li key={k} className="text-sm"><b>{v.label}</b> <span className="text-ink-soft">— {v.desc}</span></li>)}</ul>
      </section>
      <section aria-labelledby="sinbo"><h2 id="sinbo" className="mb-2 text-lg font-black">지역신용보증재단 (17곳)</h2>
        <ul className="grid gap-2 sm:grid-cols-3">{m.funds.map((f) => (
          <li key={f.sido}><a href={f.url} target="_blank" rel="noopener noreferrer" className={`card block p-3 text-sm hover:shadow-md ${mine === f.sido ? 'border-cobalt ring-2 ring-cobalt/20' : ''}`}>
            <span className="text-xs text-ink-mute">{f.sido}{mine === f.sido ? ' · 내 지역' : ''}</span><span className="block font-bold">{f.name} ↗</span></a></li>
        ))}</ul>
      </section>
      <p className="text-xs text-ink-mute">보증·융자 한도와 조건은 재단 상담으로 확정돼요. PLIT 은 공식 사이트로 연결만 해요.</p>
    </div>
  );
}
