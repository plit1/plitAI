'use client';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { useRequireLogin } from '@/lib/use-login';
import { Badge, ErrorBox, Spinner } from '@/components/ui';

interface Mate {
  adopted: boolean; pet: { species: 'DOG' | 'CAT'; name: string; costume: string } | null;
  xp: number; level: number; stage: { label: string }; progress: { pct: number; toNext: number; to: number | null; lockedByClear: boolean }; clears: number;
  condition: { key: string; label: string; message: string }; badges: { id: string; label: string; done: boolean }[]; title: string;
  evolutions: { level: number; label: string; trigger: string; reachedAt: string }[]; cosmetics: { id: string; label: string; premium: boolean; available: boolean }[];
  premium: boolean; stages: { level: number; label: string; minXp: number }[]; note: string;
}
const FACE: Record<string, string> = { DOG: '🐶', CAT: '🐱' };

export default function MatePage() {
  const { ready } = useRequireLogin('/my/mate');
  const { data: m, error, loading, reload, setData } = useApi<Mate>(ready ? '/me/mate' : null);
  const [name, setName] = useState(''); const [err, setErr] = useState<string | null>(null);
  const call = async (method: 'POST' | 'PATCH', json: object) => {
    setErr(null);
    try { setData(await api<Mate>('/me/mate', { method, json })); setName(''); } catch (e) { setErr(e instanceof ApiError ? e.message : '잠시 후 다시 시도해주세요.'); }
  };
  if (!ready || loading) return <Spinner />;
  if (error) return <ErrorBox message={error.message} onRetry={reload} />;
  if (!m) return null;

  if (!m.adopted) return (
    <section className="card mx-auto max-w-md space-y-4 p-6 text-center">
      <h1 className="text-xl font-black">함께 공부할 메이트를 골라주세요</h1>
      <p className="text-sm text-ink-soft">공부할수록 메이트가 자라요. 지금까지 쌓은 XP 는 그대로 반영돼요.</p>
      <label className="block text-left text-sm font-semibold">이름 (선택)<input className="input mt-1 w-full" maxLength={10} value={name} onChange={(e) => setName(e.target.value)} placeholder="플리" /></label>
      <div className="flex justify-center gap-3">
        {(['DOG', 'CAT'] as const).map((s) => <button key={s} className="btn-primary" onClick={() => call('POST', { species: s, name: name || undefined })}>{FACE[s]} {s === 'DOG' ? '강아지' : '고양이'}</button>)}
      </div>
      {err && <p role="alert" className="text-sm text-risk">{err}</p>}
    </section>
  );

  return (
    <div className="space-y-4">
      <section className="card flex flex-wrap items-center gap-5 p-5" aria-labelledby="mate-name">
        <div className="grid h-24 w-24 place-items-center rounded-3xl bg-cobalt-tint text-5xl" aria-hidden>{FACE[m.pet!.species]}</div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap gap-1"><Badge tone="cobalt">Lv.{m.level} {m.stage.label}</Badge><Badge tone="gold">{m.title}</Badge><Badge tone={m.condition.key === 'SLEEPY' || m.condition.key === 'TIRED' ? 'mute' : 'clear'}>{m.condition.label}</Badge></div>
          <h1 id="mate-name" className="text-xl font-black">{m.pet!.name}</h1>
          <p className="text-sm text-ink-soft">{m.condition.message}</p>
          <div className="h-2 overflow-hidden rounded-full bg-ink-line" role="progressbar" aria-label="다음 단계까지" aria-valuenow={m.progress.pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-clear" style={{ width: `${m.progress.pct}%` }} /></div>
          <p className="text-xs text-ink-mute">누적 {m.xp}XP · {m.progress.to === null ? '최고 단계예요' : m.progress.lockedByClear ? '마지막 진화는 합격 인증 후 열려요' : `다음 단계까지 ${m.progress.toNext}XP`}</p>
        </div>
      </section>

      <section className="card space-y-3 p-5" aria-labelledby="custom">
        <h2 id="custom" className="text-sm font-bold">꾸미기</h2>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) call('PATCH', { name }); }}>
          <input className="input flex-1" aria-label="새 이름" maxLength={10} value={name} onChange={(e) => setName(e.target.value)} placeholder={m.pet!.name} />
          <button className="btn-primary" type="submit">이름 변경</button>
        </form>
        <div className="flex flex-wrap gap-2">
          {(['DOG', 'CAT'] as const).map((s) => <button key={s} aria-pressed={m.pet!.species === s} className={`rounded-xl border px-3 py-1.5 text-sm ${m.pet!.species === s ? 'border-cobalt bg-cobalt-tint font-bold' : 'border-ink-line'}`} onClick={() => call('PATCH', { species: s })}>{FACE[s]} {s === 'DOG' ? '강아지' : '고양이'}</button>)}
        </div>
        <div className="flex flex-wrap gap-2">
          {m.cosmetics.map((c) => (
            <button key={c.id} disabled={!c.available} aria-pressed={m.pet!.costume === c.id} title={c.available ? undefined : '플릿 부스터 패스 참여 중에 사용할 수 있어요'}
              className={`rounded-xl border px-3 py-1.5 text-sm disabled:opacity-40 ${m.pet!.costume === c.id ? 'border-cobalt bg-cobalt-tint font-bold' : 'border-ink-line'}`} onClick={() => call('PATCH', { costume: c.id })}>
              {c.label}{c.premium && ' ✦'}
            </button>
          ))}
        </div>
        {err && <p role="alert" className="text-sm text-risk">{err}</p>}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="card p-5" aria-labelledby="badges">
          <h2 id="badges" className="text-sm font-bold">배지 {m.badges.filter((b) => b.done).length}/{m.badges.length}</h2>
          <ul className="mt-2 flex flex-wrap gap-2">{m.badges.map((b) => <li key={b.id}><Badge tone={b.done ? 'clear' : 'mute'}>{b.done ? '★' : '☆'} {b.label}</Badge></li>)}</ul>
        </section>
        <section className="card p-5" aria-labelledby="evo">
          <h2 id="evo" className="text-sm font-bold">성장 기록</h2>
          <ol className="mt-2 space-y-1 text-sm">{m.evolutions.map((e) => <li key={e.level}>Lv.{e.level} {e.label} <span className="text-xs text-ink-mute">· {new Date(e.reachedAt).toLocaleDateString('ko-KR')}</span></li>)}</ol>
          <p className="mt-2 text-xs text-ink-mute">단계: {m.stages.map((s) => `${s.label} ${s.minXp}XP`).join(' → ')}</p>
        </section>
      </div>
      <p className="text-xs text-ink-mute">{m.note}</p>
    </div>
  );
}
