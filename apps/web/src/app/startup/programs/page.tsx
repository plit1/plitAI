'use client';
import { useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/use-api';
import { Chip, ErrorBox, Spinner } from '@/components/ui';
import { Meta, Program, ProgramCard, StartupNav } from '@/components/startup';

export default function Programs() {
  const { me } = useAuth();
  const meta = useApi<Meta>('/startup/meta');
  const [q, setQ] = useState(''); const [applied, setApplied] = useState('');
  const [region, setRegion] = useState(''); const [industry, setIndustry] = useState(''); const [type, setType] = useState(''); const [saved, setSaved] = useState(false);
  const path = useMemo(() => {
    const p = new URLSearchParams({ sort: me ? 'match' : 'deadline' });
    if (applied) p.set('q', applied); if (region) p.set('region', region); if (industry) p.set('industry', industry); if (type) p.set('type', type);
    return saved ? '/me/startup/saved' : `/startup/programs?${p}`;
  }, [applied, region, industry, type, me, saved]);
  const { data, error, loading, reload } = useApi<{ items: Program[] } | Program[]>(path);
  const items = data ? (Array.isArray(data) ? data : data.items) : [];
  const m = meta.data;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2"><h1 className="text-2xl font-black">지원사업</h1><StartupNav /></div>
      <form role="search" className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setApplied(q.trim()); }}>
        <input className="input" aria-label="지원사업 검색" placeholder="사업명·기관" value={q} onChange={(e) => setQ(e.target.value)} maxLength={50} />
        <button className="btn-primary shrink-0" type="submit">검색</button>
      </form>
      {m && (
        <div className="space-y-2">
          {me && <Chip on={saved} onClick={() => setSaved(!saved)}>★ 관심 사업만</Chip>}
          <div className="flex flex-wrap gap-1" aria-label="지역"><Chip on={!region} onClick={() => setRegion('')}>전체 지역</Chip>{m.sido.map((r) => <Chip key={r} on={region === r} onClick={() => setRegion(region === r ? '' : r)}>{r}</Chip>)}</div>
          <div className="flex flex-wrap gap-1" aria-label="업종"><Chip on={!industry} onClick={() => setIndustry('')}>전체 업종</Chip>{m.industries.map((i) => <Chip key={i.code} on={industry === i.code} onClick={() => setIndustry(industry === i.code ? '' : i.code)}>{i.name}</Chip>)}</div>
          <div className="flex flex-wrap gap-1" aria-label="지원 유형"><Chip on={!type} onClick={() => setType('')}>전체 유형</Chip>{Object.entries(m.supportTypes).map(([k, v]) => <Chip key={k} on={type === k} onClick={() => setType(type === k ? '' : k)}>{v.label}</Chip>)}</div>
        </div>
      )}
      {loading ? <Spinner /> : error ? <ErrorBox message={error.message} onRetry={reload} /> : items.length === 0 ? <p className="card p-8 text-center text-sm text-ink-mute">조건에 맞는 지원사업이 없어요.</p> : (
        <ul className="grid gap-3 sm:grid-cols-2">{items.map((p) => <ProgramCard key={p.id} p={p} />)}</ul>
      )}
      {m && <p className="text-xs text-ink-mute">{m.notice}</p>}
    </div>
  );
}
