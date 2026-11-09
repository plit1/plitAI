'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/use-api';
import { Badge, ErrorBox, FIELD_LABEL, OR_STATUS, Spinner } from '@/components/ui';

interface Req { id: string; title: string; category: string; round: string | null; reason: string | null; status: string; interestCount: number; targetCount: number; progress: number }

export default function OpenRun() {
  const { me } = useAuth();
  const [sort, setSort] = useState<'popular' | 'recent'>('popular');
  const list = useApi<Req[]>(`/open-run?sort=${sort}`);
  const mine = useApi<{ interested: Req[]; requested: (Req & { reviewNote: string | null })[] }>(me ? '/me/open-run' : null);
  const [form, setForm] = useState({ title: '', category: 'biz', round: '', reason: '' });
  const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<{ text: string; certId?: string } | null>(null);
  const interested = new Set((mine.data?.interested ?? []).map((r) => r.id));

  const toggle = async (r: Req) => {
    setErr(null);
    try { await api(`/open-run/${r.id}/interest`, { method: interested.has(r.id) ? 'DELETE' : 'PUT', json: {} }); await Promise.all([list.reload(), mine.reload()]); }
    catch (e) { setErr({ text: e instanceof ApiError ? e.message : '처리하지 못했어요.' }); }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setMsg(null);
    try {
      const r = await api<{ merged: boolean; request: Req }>('/open-run', { method: 'POST', json: { ...form, round: form.round || undefined, reason: form.reason || undefined } });
      setMsg(r.merged ? `이미 요청된 자격증이라 관심에 함께했어요 (${r.request.interestCount}명).` : '요청을 등록했어요. 운영 검토 후 공개돼요.');
      setForm({ title: '', category: 'biz', round: '', reason: '' });
      await Promise.all([list.reload(), mine.reload()]);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'CERT_EXISTS') setErr({ text: e.message, certId: (e.details as { certId: string }).certId });
      else setErr({ text: e instanceof ApiError ? e.message : '등록하지 못했어요.' });
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <p className="font-display text-xs font-bold tracking-widest text-cobalt">OPEN RUN</p>
        <h1 className="text-2xl font-black">원하는 자격증 챌린지를 열어주세요</h1>
        <p className="mt-1 text-sm text-ink-soft">같이 준비할 사람이 목표 인원만큼 모이면 운영팀이 개설을 검토해요. 자동으로 개설되지는 않아요.</p>
      </header>

      {err && <div role="alert" className="card bg-risk-tint p-4 text-sm text-risk">{err.text}{err.certId && <> · <Link className="font-semibold underline" href={`/finder?q=${encodeURIComponent(form.title)}`}>자격증찾기에서 보기</Link></>}</div>}
      {msg && <p role="status" className="rounded-xl bg-clear-tint p-3 text-sm text-clear-deep">{msg}</p>}

      {me ? (
        <form onSubmit={submit} className="card grid gap-3 p-5 sm:grid-cols-2">
          <div><label htmlFor="t" className="label">자격증 이름</label><input id="t" className="input" required maxLength={60} placeholder="예: 보세사" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div><label htmlFor="c" className="label">분야</label><select id="c" className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{Object.entries(FIELD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label htmlFor="r" className="label">희망 시험 회차 (선택)</label><input id="r" className="input" maxLength={30} placeholder="예: 2027년 상반기" value={form.round} onChange={(e) => setForm({ ...form, round: e.target.value })} /></div>
          <div><label htmlFor="w" className="label">필요한 이유 (선택)</label><input id="w" className="input" maxLength={300} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
          <p className="text-[11px] text-ink-mute sm:col-span-2">연락처·메신저 ID·외부 링크는 올릴 수 없어요.</p>
          <button className="btn-primary sm:col-span-2">개설 요청하기</button>
        </form>
      ) : <p className="card p-5 text-sm"><Link href="/login?next=/open-run" className="font-semibold text-cobalt">로그인</Link>하면 개설을 요청하거나 관심을 표시할 수 있어요.</p>}

      <section aria-labelledby="list">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="list" className="text-lg font-black">요청 목록</h2>
          <div className="flex gap-1 text-xs" role="group" aria-label="정렬">
            {(['popular', 'recent'] as const).map((s) => <button key={s} aria-pressed={sort === s} onClick={() => setSort(s)} className={`rounded-full px-3 py-1 ${sort === s ? 'bg-ink text-white' : 'text-ink-mute'}`}>{s === 'popular' ? '관심 많은 순' : '최신순'}</button>)}
          </div>
        </div>
        {list.loading ? <Spinner /> : list.error ? <ErrorBox message={list.error.message} onRetry={list.reload} /> : list.data!.length === 0 ? <p className="card p-8 text-center text-sm text-ink-mute">아직 공개된 요청이 없어요.</p> : (
          <ul className="grid gap-3 sm:grid-cols-2">{list.data!.map((r) => {
            const [label, tone] = OR_STATUS[r.status]; const canToggle = me && (r.status === 'COLLECTING' || r.status === 'THRESHOLD_REACHED');
            return (
              <li key={r.id} className="card p-4">
                <div className="flex gap-1"><Badge tone="mute">{FIELD_LABEL[r.category]}</Badge><Badge tone={tone}>{label}</Badge></div>
                <h3 className="mt-2 font-bold">{r.title}</h3>
                {r.round && <p className="text-xs text-ink-mute">{r.round}</p>}
                {r.reason && <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{r.reason}</p>}
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-line" role="progressbar" aria-valuenow={r.interestCount} aria-valuemin={0} aria-valuemax={r.targetCount} aria-label={`${r.title} 관심 인원`}><div className="h-full bg-cobalt" style={{ width: `${r.progress}%` }} /></div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-ink-soft">{r.interestCount} / {r.targetCount}명</span>
                  {canToggle && <button className={interested.has(r.id) ? 'font-semibold text-ink-mute' : 'font-semibold text-cobalt'} onClick={() => toggle(r)}>{interested.has(r.id) ? '관심 취소' : '나도 필요해요'}</button>}
                </div>
              </li>
            );
          })}</ul>
        )}
      </section>

      {me && (mine.data?.requested.length ?? 0) > 0 && (
        <section aria-labelledby="mine" className="space-y-2">
          <h2 id="mine" className="text-lg font-black">내가 요청한 자격증</h2>
          <ul className="card divide-y divide-ink-line/70">{mine.data!.requested.map((r) => (
            <li key={r.id} className="flex items-center justify-between p-3 text-sm"><span>{r.title}{r.reviewNote && <span className="ml-2 text-xs text-risk">{r.reviewNote}</span>}</span><Badge tone={OR_STATUS[r.status][1]}>{OR_STATUS[r.status][0]}</Badge></li>
          ))}</ul>
        </section>
      )}
    </div>
  );
}
