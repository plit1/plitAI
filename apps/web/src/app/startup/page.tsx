'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/use-api';
import { Chip, ErrorBox, Spinner } from '@/components/ui';
import { Meta, Program, ProgramCard, StartupNav } from '@/components/startup';

export interface SProfile {
  industry: string | null; sido: string; sigungu: string; stage: string; budget: string; effectiveIndustry: string | null;
  suggestion: { certId: string; status: string; industry: string; reason: string } | null; certs: { certId: string; name: string; status: string }[];
  roadmap: { id: string; title: string; desc: string; path: string | null; done: boolean }[]; progress: { done: number; total: number };
  fund: { sido: string; name: string; url: string } | null; industryChecks: string[];
}

export default function StartupHome() {
  const { me } = useAuth();
  const meta = useApi<Meta>('/startup/meta');
  const prof = useApi<SProfile>(me ? '/me/startup-profile' : null);
  const progs = useApi<{ items: Program[] }>(`/startup/programs?sort=${me ? 'match' : 'deadline'}`);
  const [f, setF] = useState<{ industry: string | null; sido: string; sigungu: string; stage: string; budget: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (prof.data && !f) { const p = prof.data; setF({ industry: p.industry, sido: p.sido, sigungu: p.sigungu, stage: p.stage, budget: p.budget }); } }, [prof.data, f]);
  if (meta.loading) return <Spinner />;
  if (meta.error) return <ErrorBox message={meta.error.message} onRetry={meta.reload} />;
  const m = meta.data!;
  const name = (code: string | null) => m.industries.find((i) => i.code === code)?.name ?? '미정';
  const save = async () => {
    setMsg(null);
    try { prof.setData(await api<SProfile>('/me/startup-profile', { method: 'PUT', json: f })); setMsg('저장했어요. 지원사업 맞춤도에 반영돼요.'); progs.reload(); } catch (e) { setMsg(e instanceof ApiError ? e.message : '잠시 후 다시 시도해주세요.'); }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2"><h1 className="text-2xl font-black">창업하기</h1><StartupNav /></div>
      <p className="text-sm text-ink-soft">자격증을 살려 내 가게를 준비해요. 업종·지역·단계를 정하면 맞는 지원사업과 준비 순서를 보여드려요.</p>
      {!me ? (
        <p className="card p-5 text-sm">맞춤 추천을 받으려면 <Link href="/login?next=/startup" className="font-semibold text-cobalt">로그인</Link>하세요. 지원사업 목록은 로그인 없이 볼 수 있어요.</p>
      ) : prof.loading || !f ? <Spinner /> : prof.error ? <ErrorBox message={prof.error.message} onRetry={prof.reload} /> : (
        <section className="card space-y-3 p-5" aria-labelledby="sp">
          <h2 id="sp" className="text-sm font-bold">내 창업 계획 · 로드맵 {prof.data!.progress.done}/{prof.data!.progress.total}</h2>
          {prof.data!.suggestion && <p className="rounded-xl bg-cobalt-tint p-3 text-sm">자격증 기반 추천 업종: <b>{name(prof.data!.suggestion.industry)}</b> <span className="text-xs text-ink-soft">({prof.data!.suggestion.reason})</span></p>}
          <fieldset><legend className="mb-1 text-xs font-semibold text-ink-soft">업종</legend><div className="flex flex-wrap gap-1">
            <Chip on={f.industry === null} onClick={() => setF({ ...f, industry: null })}>추천 업종 사용</Chip>
            {m.industries.map((i) => <Chip key={i.code} on={f.industry === i.code} onClick={() => setF({ ...f, industry: i.code })}>{i.name}</Chip>)}
          </div></fieldset>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-semibold text-ink-soft">시·도<select className="input mt-1" value={f.sido} onChange={(e) => setF({ ...f, sido: e.target.value, sigungu: e.target.value ? f.sigungu : '' })}><option value="">선택 안 함</option>{m.sido.map((s) => <option key={s}>{s}</option>)}</select></label>
            <label className="text-xs font-semibold text-ink-soft">시·군·구<input className="input mt-1" maxLength={20} disabled={!f.sido} value={f.sigungu} onChange={(e) => setF({ ...f, sigungu: e.target.value })} placeholder="예: 수원시" /></label>
          </div>
          <fieldset><legend className="mb-1 text-xs font-semibold text-ink-soft">단계</legend><div className="flex flex-wrap gap-1">{Object.entries(m.stages).map(([k, v]) => <Chip key={k} on={f.stage === k} onClick={() => setF({ ...f, stage: k })}>{v.label}</Chip>)}</div></fieldset>
          <label className="block text-xs font-semibold text-ink-soft">예산<select className="input mt-1" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })}>{m.budgets.map((b) => <option key={b} value={b}>{b || '선택 안 함'}</option>)}</select></label>
          <button className="btn-primary" onClick={save}>저장</button>
          {msg && <p role="status" className="text-sm text-ink-soft">{msg}</p>}
          {prof.data!.industryChecks.length > 0 && (
            <div className="text-sm"><p className="font-bold">{name(prof.data!.effectiveIndustry)} 창업 전 확인할 것</p><ul className="mt-1 space-y-0.5 text-ink-soft">{prof.data!.industryChecks.map((c) => <li key={c}>· {c}</li>)}</ul><p className="mt-1 text-xs text-ink-mute">법령·인허가 요건은 관할 지자체에 꼭 확인하세요.</p></div>
          )}
        </section>
      )}
      <section aria-labelledby="progs" className="space-y-2">
        <div className="flex items-center justify-between"><h2 id="progs" className="text-lg font-black">{me ? '맞춤 지원사업' : '지원사업'}</h2><Link href="/startup/programs" className="text-sm font-semibold text-cobalt">전체 보기 →</Link></div>
        {progs.loading ? <Spinner /> : progs.error ? <ErrorBox message={progs.error.message} onRetry={progs.reload} /> : (
          <ul className="grid gap-3 sm:grid-cols-2">{progs.data!.items.slice(0, 6).map((p) => <ProgramCard key={p.id} p={p} />)}</ul>
        )}
      </section>
      <p className="text-xs text-ink-mute">{m.notice}</p>
    </div>
  );
}
