'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Badge, ErrorBox, Spinner } from '@/components/ui';

interface Item { no: number; id: string; subject: string; prompt: string; options: string[]; answer?: number; chosen?: number | null; correct?: boolean; explanation?: string | null }
interface Result { correct: number; total: number; accuracy: number; expectedScore: number; passZone: boolean; failRisk: boolean; failRiskSubjects: string[]; indexBefore: number | null; indexAfter: number | null; subjects: { name: string; accuracy: number }[] }
interface Attempt { id: string; kind: 'QUICK' | 'FINAL'; title: string; total: number; notice: string | null; items: Item[]; submittedAt: string | null; result: Result | null }

export default function Quiz() {
  const { id } = useParams<{ id: string }>();
  const [a, setA] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [error, setError] = useState<ApiError | null>(null); const [msg, setMsg] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  const start = async () => {
    setError(null);
    try { setA(await api<Attempt>(`/enrollments/${id}/quiz`, { method: 'POST' })); setAnswers({}); }
    catch (e) { setError(e instanceof ApiError ? e : new ApiError(0, 'NETWORK', '불러오지 못했어요.')); }
  };
  useEffect(() => { start(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!a) return;
    const missing = a.items.filter((i) => answers[i.id] === undefined).map((i) => i.no);
    if (missing.length) { setMsg(`아직 ${missing.length}문항이 남았어요: ${missing.join(', ')}번`); return; }
    setBusy(true); setMsg(null);
    try { setA(await api<Attempt>(`/quiz-attempts/${a.id}/submit`, { method: 'POST', json: { answers } })); window.scrollTo({ top: 0 }); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : '제출하지 못했어요.'); } finally { setBusy(false); }
  };

  if (error) return (
    <div className="space-y-3"><ErrorBox message={error.message} />
      {error.code === 'PREMIUM_REQUIRED' && <p className="text-sm">QUICK TEST 는 플릿 부스터 패스 전용이에요. <Link className="font-semibold text-cobalt" href={`/dashboard/${id}`}>대시보드로</Link></p>}
    </div>
  );
  if (!a) return <Spinner label="문항 준비 중" />;
  const r = a.result;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header className="flex items-center justify-between"><h1 className="text-2xl font-black">{a.title}</h1><Link href={`/dashboard/${id}`} className="text-sm text-ink-mute">대시보드</Link></header>
      {a.notice && <p className="rounded-xl border border-dashed border-gold px-4 py-2 text-sm font-semibold text-gold">{a.notice}</p>}
      {a.kind === 'FINAL' && !r && <p className="rounded-xl bg-clear-tint px-4 py-2 text-sm font-semibold text-clear-deep">시험 D-7 이하라 FINAL CLEAR TEST 로 진행돼요.</p>}

      {r && (
        <section className="card space-y-2 p-5" aria-label="채점 결과">
          <p className="font-display text-4xl font-black text-cobalt">{r.accuracy}%<span className="ml-2 text-base text-ink-mute">{r.correct}/{r.total} 정답</span></p>
          <p className="text-sm">예상 점수 {r.expectedScore}점 · {r.passZone ? <Badge tone="clear">합격권</Badge> : <Badge tone="risk">합격권 아님</Badge>}</p>
          {r.failRisk && <p className="text-sm text-risk">과락 위험 과목: {r.failRiskSubjects.join(', ')}</p>}
          {r.indexBefore != null && <p className="text-xs text-ink-soft">PLIT 도전 지표(추정) {r.indexBefore} → {r.indexAfter}</p>}
          <ul className="grid grid-cols-2 gap-1 text-xs">{r.subjects.map((s) => <li key={s.name} className="rounded-lg bg-paper px-2 py-1">{s.name} {s.accuracy}%</li>)}</ul>
          <button className="btn-primary" onClick={start}>다시 점검하기</button>
        </section>
      )}

      <ol className="space-y-3">{a.items.map((i) => (
        <li key={i.id} className={`card p-4 ${r ? (i.correct ? 'border-clear-deep/40' : 'border-risk/40') : ''}`}>
          <fieldset>
            <legend className="text-sm font-bold"><span className="text-ink-mute">{i.no}.</span> {i.prompt} <span className="ml-1 text-[11px] font-normal text-ink-mute">{i.subject}</span></legend>
            <div className="mt-2 grid gap-1">{i.options.map((o, k) => {
              const picked = (r ? i.chosen : answers[i.id]) === k;
              const tone = r ? (k === i.answer ? 'border-clear-deep bg-clear-tint' : picked ? 'border-risk bg-risk-tint' : 'border-ink-line') : picked ? 'border-cobalt bg-cobalt-tint' : 'border-ink-line';
              return (
                <label key={k} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${tone}`}>
                  <input type="radio" name={i.id} disabled={!!r} checked={picked} onChange={() => setAnswers({ ...answers, [i.id]: k })} />{o}
                </label>
              );
            })}</div>
            {r && i.explanation && <p className="mt-2 text-xs text-ink-soft">{i.explanation}</p>}
          </fieldset>
        </li>
      ))}</ol>
      {!r && (
        <div className="sticky bottom-3 card flex items-center justify-between gap-2 p-3">
          <span className="text-sm text-ink-soft">{Object.keys(answers).length}/{a.total} 응답</span>
          {msg && <span role="alert" className="text-xs text-risk">{msg}</span>}
          <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? '채점 중…' : '제출하기'}</button>
        </div>
      )}
    </div>
  );
}
