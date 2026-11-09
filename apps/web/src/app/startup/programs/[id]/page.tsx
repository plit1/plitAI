'use client';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/use-api';
import { Badge, ErrorBox, LIFE, MATCH, Spinner } from '@/components/ui';
import { Program, StartupNav } from '@/components/startup';

export default function ProgramDetail() {
  const { id } = useParams<{ id: string }>(); const { me } = useAuth(); const router = useRouter();
  const { data: p, error, loading, reload, setData } = useApi<Program & { eligibility: string; summary: string; notice: string }>(`/startup/programs/${id}`);
  const [err, setErr] = useState<string | null>(null);
  const toggle = async () => {
    if (!me) return router.push(`/login?next=/startup/programs/${id}`);
    try { const r = await api<{ saved: boolean }>(`/startup/programs/${id}/save`, { method: p!.saved ? 'DELETE' : 'PUT' }); setData({ ...p!, saved: r.saved }); } catch (e) { setErr(e instanceof ApiError ? e.message : '잠시 후 다시 시도해주세요.'); }
  };
  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error.message} onRetry={reload} />;
  if (!p) return null;
  const date = (s: string | null) => (s ? new Date(s).toLocaleDateString('ko-KR') : '-');
  return (
    <div className="space-y-4">
      <StartupNav />
      <article className="card space-y-3 p-5">
        <div className="flex flex-wrap gap-1"><Badge tone={LIFE[p.life]?.[1] ?? 'mute'}>{LIFE[p.life]?.[0] ?? p.life}</Badge><Badge tone="mute">{p.supportTypeLabel}</Badge>{p.isDemo && <Badge tone="mute">데모 공고</Badge>}{p.match && <Badge tone={MATCH[p.match.level][1]}>{MATCH[p.match.level][0]}</Badge>}</div>
        <h1 className="text-xl font-black">{p.title}</h1>
        <dl className="grid grid-cols-[5rem_1fr] gap-y-1 text-sm">
          <dt className="text-ink-mute">기관</dt><dd>{p.agency}</dd>
          <dt className="text-ink-mute">지역</dt><dd>{p.region}{p.sigungu ? ` ${p.sigungu}` : ''}</dd>
          <dt className="text-ink-mute">접수 기간</dt><dd>{date(p.applyStart)} ~ {date(p.applyEnd)}</dd>
          <dt className="text-ink-mute">신청 자격</dt><dd>{p.eligibility}</dd>
        </dl>
        {p.match && p.match.reasons.length > 0 && <div className="rounded-xl bg-cobalt-tint p-3 text-sm"><p className="font-bold text-cobalt">맞춤 이유 (참고용)</p><ul className="mt-1 space-y-0.5">{p.match.reasons.map((r) => <li key={r}>· {r}</li>)}</ul></div>}
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{p.summary}</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost border border-ink-line" onClick={toggle} aria-pressed={!!p.saved}>{p.saved ? '★ 관심 해제' : '☆ 관심 사업 저장'}</button>
          {p.sourceUrl && !p.isDemo && <a className="btn-primary" href={p.sourceUrl} target="_blank" rel="noopener noreferrer">원문 공고 보기 ↗</a>}
        </div>
        {err && <p role="alert" className="text-sm text-risk">{err}</p>}
        <p className="text-xs text-ink-mute">{p.notice}</p>
      </article>
    </div>
  );
}
