'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useApi } from '@/lib/use-api';
import { api, dday } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, ErrorBox, FIELD_LABEL, Spinner } from '@/components/ui';

interface Cert { id: string; name: string; field: string; qualType: string; issuer: string; difficulty: number; tagline: string; nextOffering: { id: string; round: string; status: string; recruitEnd: string; examDate: string } | null }
const GROUPS = [['', '전체'], ['NATIONAL_TECH', '국가기술'], ['NATIONAL_PRO', '국가전문·국가자격'], ['PRIVATE', '민간·공인민간'], ['LANGUAGE', '어학']];

export default function Finder() {
  const [q, setQ] = useState(''); const [field, setField] = useState(''); const [group, setGroup] = useState('');
  const [applied, setApplied] = useState('');
  const params = new URLSearchParams(Object.entries({ q: applied, field, group }).filter(([, v]) => v)).toString();
  const { data, error, loading, reload } = useApi<{ items: Cert[]; total: number }>(`/certifications${params ? `?${params}` : ''}`);
  const { me } = useAuth();
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const toggle = async (id: string) => {
    const on = !saved[id];
    await api(`/certifications/${id}/favorite`, { method: on ? 'PUT' : 'DELETE' });
    setSaved((s) => ({ ...s, [id]: on }));
  };
  const days = (d: string) => Math.round((Date.parse(d) - Date.now()) / 86400000);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">자격증찾기</h1>
      <form role="search" onSubmit={(e) => { e.preventDefault(); setApplied(q.trim()); }} className="flex gap-2">
        <label htmlFor="q" className="sr-only">자격증 검색</label>
        <input id="q" className="input" placeholder="예: 산업안전기사, 바리스타, 컴활" value={q} onChange={(e) => setQ(e.target.value)} maxLength={50} />
        <button className="btn-primary shrink-0">검색</button>
      </form>
      <div className="flex flex-wrap gap-2" role="group" aria-label="분야">
        {[['', '전체 분야'], ...Object.entries(FIELD_LABEL)].map(([id, label]) => (
          <button key={id} aria-pressed={field === id} onClick={() => setField(id)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${field === id ? 'bg-ink text-white' : 'bg-surface text-ink-soft border border-ink-line'}`}>{label}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="자격 구분">
        {GROUPS.map(([id, label]) => (
          <button key={id} aria-pressed={group === id} onClick={() => setGroup(id)} className={`rounded-full px-3 py-1 text-xs ${group === id ? 'bg-cobalt text-white' : 'text-ink-mute'}`}>{label}</button>
        ))}
      </div>
      {loading ? <Spinner /> : error ? <ErrorBox message={error.message} onRetry={reload} /> : data!.items.length === 0 ? (
        <p className="card p-8 text-center text-sm text-ink-mute">조건에 맞는 자격증이 없어요.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2" aria-label={`검색 결과 ${data!.total}개`}>
          {data!.items.map((c) => (
            <li key={c.id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap gap-1"><Badge tone="mute">{FIELD_LABEL[c.field]}</Badge><Badge>{c.qualType}</Badge></div>
                  <h2 className="mt-2 font-bold">{c.name}</h2>
                  <p className="text-xs text-ink-mute">{c.issuer} · 난이도 {'★'.repeat(c.difficulty)}</p>
                </div>
                {me && <button aria-label={`${c.name} 관심 ${saved[c.id] ? '해제' : '저장'}`} onClick={() => toggle(c.id)} className="text-xl text-gold">{saved[c.id] ? '★' : '☆'}</button>}
              </div>
              <p className="mt-2 text-sm text-ink-soft">{c.tagline}</p>
              {c.nextOffering ? (
                <Link href={`/challenges/${c.nextOffering.id}`} className="mt-3 flex items-center justify-between rounded-xl bg-paper px-3 py-2 text-xs font-semibold">
                  <span>{c.nextOffering.round} · 시험 {dday(days(c.nextOffering.examDate))}</span>
                  <span className={c.nextOffering.status === 'open' ? 'text-cobalt' : 'text-ink-mute'}>{c.nextOffering.status === 'open' ? '챌린지 보기 →' : '모집 마감'}</span>
                </Link>
              ) : <p className="mt-3 text-xs text-ink-mute">예정된 챌린지가 없어요</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
