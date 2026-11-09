'use client';
import { useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/use-api';
import { Chip, ErrorBox, Spinner } from '@/components/ui';
import { Job, JobCard, JobsNav, JOBS_NOTICE } from '@/components/jobs';

interface List { items: Job[]; total: number; regions: string[]; employment: string[]; experience: Record<string, string> }

export default function Jobs() {
  const { me } = useAuth();
  const [q, setQ] = useState(''); const [applied, setApplied] = useState('');
  const [region, setRegion] = useState(''); const [emp, setEmp] = useState(''); const [sort, setSort] = useState<'match' | 'deadline' | 'recent'>('recent');
  const path = useMemo(() => {
    const p = new URLSearchParams();
    if (applied) p.set('q', applied); if (region) p.set('region', region); if (emp) p.set('employment', emp); p.set('sort', sort);
    return `/jobs?${p}`;
  }, [applied, region, emp, sort]);
  const { data, error, loading, reload } = useApi<List>(path);
  const rec = useApi<{ certs: { certId: string; name: string; status: string }[]; items: Job[] }>(me ? '/jobs/recommended' : null);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2"><h1 className="text-2xl font-black">취업하기</h1><JobsNav /></div>
      {me && rec.data && (
        <section className="card space-y-2 p-4" aria-labelledby="rec">
          <h2 id="rec" className="text-sm font-bold">내 자격증 맞춤 공고 {rec.data.items.length}건</h2>
          {rec.data.certs.length === 0 ? <p className="text-xs text-ink-mute">챌린지에 참여하거나 맞춤 조건에서 보유 자격증을 등록하면 맞춤 공고를 보여드려요.</p> : (
            <ul className="grid gap-2 sm:grid-cols-2">{rec.data.items.slice(0, 4).map((j) => <JobCard key={j.id} j={j} />)}</ul>
          )}
        </section>
      )}
      <form role="search" className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setApplied(q.trim()); }}>
        <input className="input" aria-label="공고 검색" placeholder="회사·직무·자격증 이름" value={q} onChange={(e) => setQ(e.target.value)} maxLength={50} />
        <button className="btn-primary shrink-0" type="submit">검색</button>
      </form>
      {data && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1" aria-label="지역"><Chip on={!region} onClick={() => setRegion('')}>전국</Chip>{data.regions.map((r) => <Chip key={r} on={region === r} onClick={() => setRegion(region === r ? '' : r)}>{r}</Chip>)}</div>
          <div className="flex flex-wrap gap-1" aria-label="고용 형태"><Chip on={!emp} onClick={() => setEmp('')}>전체</Chip>{data.employment.map((r) => <Chip key={r} on={emp === r} onClick={() => setEmp(emp === r ? '' : r)}>{r}</Chip>)}</div>
        </div>
      )}
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink-mute">{data ? `${data.total}건` : ''}</span>
        <label className="flex items-center gap-1">정렬
          <select className="rounded-lg border border-ink-line bg-surface px-2 py-1" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="recent">최신순</option><option value="deadline">마감 임박순</option>{me && <option value="match">맞춤도순</option>}
          </select>
        </label>
      </div>
      {loading ? <Spinner /> : error ? <ErrorBox message={error.message} onRetry={reload} /> : data!.items.length === 0 ? <p className="card p-8 text-center text-sm text-ink-mute">조건에 맞는 공고가 없어요.</p> : (
        <ul className="grid gap-3 sm:grid-cols-2">{data!.items.map((j) => <JobCard key={j.id} j={j} />)}</ul>
      )}
      <p className="text-xs text-ink-mute">{JOBS_NOTICE}</p>
    </div>
  );
}
