'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/use-api';
import { Badge, ErrorBox, LIFE, MATCH, Spinner } from '@/components/ui';
import { Job, JobsNav } from '@/components/jobs';

export default function JobDetail() {
  const { id } = useParams<{ id: string }>(); const { me } = useAuth(); const router = useRouter();
  const { data: j, error, loading, reload, setData } = useApi<Job & { description: string; notice: string }>(`/jobs/${id}`);
  const [err, setErr] = useState<string | null>(null);
  const toggle = async () => {
    if (!me) return router.push(`/login?next=/jobs/${id}`);
    try { const r = await api<{ saved: boolean }>(`/jobs/${id}/save`, { method: j!.saved ? 'DELETE' : 'PUT' }); setData({ ...j!, saved: r.saved }); } catch (e) { setErr(e instanceof ApiError ? e.message : '잠시 후 다시 시도해주세요.'); }
  };
  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error.message} onRetry={reload} />;
  if (!j) return null;
  return (
    <div className="space-y-4">
      <JobsNav />
      <article className="card space-y-3 p-5">
        <div className="flex flex-wrap gap-1"><Badge tone={LIFE[j.life]?.[1] ?? 'mute'}>{LIFE[j.life]?.[0] ?? j.life}</Badge>{j.isDemo && <Badge tone="mute">데모 공고</Badge>}{j.match && <Badge tone={MATCH[j.match.level][1]}>{MATCH[j.match.level][0]}</Badge>}</div>
        <h1 className="text-xl font-black">{j.title}</h1>
        <p className="text-sm text-ink-soft">{j.companyName}</p>
        <dl className="grid grid-cols-[5rem_1fr] gap-y-1 text-sm">
          <dt className="text-ink-mute">근무지</dt><dd>{j.workLocation}</dd>
          <dt className="text-ink-mute">고용 형태</dt><dd>{j.employmentType}</dd>
          <dt className="text-ink-mute">경력</dt><dd>{j.experienceLabel}</dd>
          {j.education && <><dt className="text-ink-mute">학력</dt><dd>{j.education}</dd></>}
          {j.salary && <><dt className="text-ink-mute">급여</dt><dd>{j.salary}</dd></>}
          <dt className="text-ink-mute">마감</dt><dd>{j.expiresAt ? new Date(j.expiresAt).toLocaleDateString('ko-KR') : '상시'}</dd>
          {j.requiredCerts.length > 0 && <><dt className="text-ink-mute">필수 자격</dt><dd>{j.requiredCerts.map((c) => <Link key={c.id} href={`/jobs/cert/${c.id}`} className="mr-2 text-cobalt underline">{c.name}</Link>)}</dd></>}
          {j.preferredCerts.length > 0 && <><dt className="text-ink-mute">우대 자격</dt><dd>{j.preferredCerts.map((c) => <Link key={c.id} href={`/jobs/cert/${c.id}`} className="mr-2 text-cobalt underline">{c.name}</Link>)}</dd></>}
        </dl>
        {j.match && j.match.reasons.length > 0 && (
          <div className="rounded-xl bg-cobalt-tint p-3 text-sm"><p className="font-bold text-cobalt">맞춤 이유 (참고용)</p><ul className="mt-1 space-y-0.5">{j.match.reasons.map((r) => <li key={r}>· {r}</li>)}</ul></div>
        )}
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{j.description}</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost border border-ink-line" onClick={toggle} aria-pressed={!!j.saved}>{j.saved ? '★ 관심 공고 해제' : '☆ 관심 공고 저장'}</button>
          {j.originalUrl && !j.isDemo && <a className="btn-primary" href={j.originalUrl} target="_blank" rel="noopener noreferrer">원문 공고에서 지원하기 ↗</a>}
        </div>
        {err && <p role="alert" className="text-sm text-risk">{err}</p>}
        <p className="text-xs text-ink-mute">{j.notice} · 정보 갱신 {new Date(j.fetchedAt).toLocaleString('ko-KR')}</p>
      </article>
    </div>
  );
}
