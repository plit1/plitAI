'use client';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, ApiError, dday } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { Badge, ErrorBox, Spinner } from '@/components/ui';

interface Session { id: string; status: 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED'; elapsedSec: number }
interface Dash {
  offeringId: string;
  plan: 'FREE' | 'PREMIUM'; cert: { name: string }; round: string; daysLeft: number; recommendedDailyMin: number;
  record: { progress: number; totalMin: number; weekMin: number; streak: number; missions: { id: string; title: string; done: boolean }[]; subjects: { name: string; progress: number }[] };
  index: { label: string; value: number | null; explanation: string[]; disclaimer: string };
  comparison: {
    sample: number; fullSample: number; minSample: number; groupAvg7: number | null; myAvg7: number | null; note: string; rankNote?: string;
    wdl: { status: 'WIN' | 'DRAW' | 'LOSE' | 'UNAVAILABLE'; reason: string | null; gapMin: number | null; gapPct: number | null };
    ranks: { today: number | null; recent7: number | null; cumulative: number | null } | null;
  };
  openSession: Session | null;
}
const fmt = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default function Dashboard() {
  const { id } = useParams<{ id: string }>();
  const { data: d, error, loading, reload } = useApi<Dash>(`/enrollments/${id}/dashboard`);
  const [session, setSession] = useState<Session | null>(null);
  const [tick, setTick] = useState(0); const [base, setBase] = useState(Date.now());
  const [toast, setToast] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (d) { setSession(d.openSession); setBase(Date.now()); } }, [d]);
  useEffect(() => { if (session?.status !== 'RUNNING') return; const t = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(t); }, [session?.status]);
  const elapsed = session ? session.elapsedSec + (session.status === 'RUNNING' ? Math.floor((Date.now() - base) / 1000) : 0) : 0;
  void tick;

  const act = async (fn: () => Promise<Session>) => { setErr(null); try { const s = await fn(); setSession(s); setBase(Date.now()); } catch (e) { setErr(e instanceof ApiError ? e.message : '처리하지 못했어요.'); } };
  const complete = async () => {
    if (!session) return; setErr(null);
    try {
      const r = await api<{ minutes: number; xp: number; missionCleared: string | null; streak: number; levelUp: number | null }>(`/sessions/${session.id}/complete`, { method: 'POST' });
      setToast(`Mission CLEAR! ${r.minutes}분 기록 · +${r.xp}XP${r.missionCleared ? ` · ${r.missionCleared}` : ''}${r.levelUp ? ` · 메이트가 Lv.${r.levelUp} 로 진화했어요!` : ''}`);
      setSession(null); reload();
    } catch (e) { setErr(e instanceof ApiError ? e.message : '기록하지 못했어요.'); }
  };

  if (loading && !d) return <Spinner />;
  if (error || !d) return <ErrorBox message={error?.message ?? '대시보드를 불러오지 못했어요.'} onRetry={reload} />;
  const outcomeTone = { WIN: 'clear', DRAW: 'cobalt', LOSE: 'risk', UNAVAILABLE: 'mute' } as const;
  const WDL_REASON: Record<string, [string, string]> = {
    COLLECTING: ['집계 중', '같은 회차 비교 인원이 충분히 모이면 WIN·DRAW·LOSE 를 보여드려요.'],
    ZERO_AVERAGE: ['집계 중', '아직 같은 회차 평균 공부 시간이 없어요.'],
    NEEDS_OBSERVATION: ['기록 쌓는 중', '최근 7일 중 3일 이상 기록되면 비교해 드려요.'],
    NOT_PARTICIPANT: ['비교 대상 아님', '이 회차 참여자만 비교할 수 있어요.'],
  };
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div><Badge tone={d.plan === 'PREMIUM' ? 'cobalt' : 'mute'}>{d.plan === 'PREMIUM' ? '플릿 부스터 패스' : '플릿런'}</Badge><h1 className="mt-1 text-2xl font-black">{d.cert.name}</h1><p className="text-sm text-ink-mute">{d.round} · 시험 {dday(d.daysLeft)}</p></div>
      </header>
      <nav aria-label="학습 메뉴" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          [`/study-room/${d.offeringId}`, '스터디룸', '함께 공부하는 회차 채팅', false],
          [`/quiz/${id}`, d.daysLeft > 0 && d.daysLeft <= 7 ? 'FINAL CLEAR TEST' : 'QUICK TEST', '실력 점검 · 취약 과목', d.plan !== 'PREMIUM'],
          [`/strategy/${id}`, 'AI 학습전략', '오늘 계획 · AI 코칭', d.plan !== 'PREMIUM'],
          [`/verify/${id}`, '합격 인증', '시험 후 결과 제출', false],
        ].map(([href, title, sub, locked]) => (
          <Link key={href as string} href={href as string} className="card block p-3 hover:shadow-md">
            <p className="text-sm font-bold">{title as string} {locked && <Badge tone="gold">부스터</Badge>}</p>
            <p className="text-[11px] text-ink-mute">{sub as string}</p>
          </Link>
        ))}
      </nav>
      {toast && <p role="status" className="rounded-xl bg-clear px-4 py-3 text-sm font-bold text-night">{toast}</p>}

      <section className="rounded-3xl bg-night p-6 text-white" aria-labelledby="today">
        <h2 id="today" className="font-display text-xs font-bold tracking-widest text-clear">오늘공부</h2>
        <p className="mt-2 font-display text-5xl font-black tabular-nums" aria-live="off">{fmt(elapsed)}</p>
        <p className="mt-1 text-xs text-white/60">오늘 권장 {d.recommendedDailyMin}분 · 연속 {d.record.streak}일</p>
        {err && <p role="alert" className="mt-2 text-sm text-risk-tint">{err}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {!session && <button className="btn-clear" onClick={() => act(() => api(`/enrollments/${id}/sessions`, { method: 'POST' }))}>공부 시작</button>}
          {session?.status === 'RUNNING' && <button className="btn bg-white/10 text-white" onClick={() => act(() => api(`/sessions/${session.id}/pause`, { method: 'POST' }))}>일시정지</button>}
          {session?.status === 'PAUSED' && <button className="btn bg-white/10 text-white" onClick={() => act(() => api(`/sessions/${session.id}/resume`, { method: 'POST' }))}>이어하기</button>}
          {session && <button className="btn-clear" onClick={complete}>공부 완료</button>}
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="card p-5" aria-labelledby="idx">
          <h2 id="idx" className="text-sm font-bold">{d.index.label}</h2>
          <p className="mt-1 font-display text-4xl font-black text-cobalt">{d.index.value ?? '–'}<span className="text-base text-ink-mute"> / 100</span></p>
          <ul className="mt-3 space-y-1 text-xs text-ink-soft">{d.index.explanation.slice(0, 4).map((x) => <li key={x}>· {x}</li>)}</ul>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-mute">{d.index.disclaimer}</p>
        </section>
        <section className="card p-5" aria-labelledby="cmp">
          <h2 id="cmp" className="text-sm font-bold">이번 주 같은 회차 챌린저와 비교</h2>
          {(() => { const c = d.comparison; return (
            <div className="mt-2 space-y-1 text-sm" data-testid="comparison">
              <Badge tone={outcomeTone[c.wdl.status]}>{c.wdl.status === 'UNAVAILABLE' ? WDL_REASON[c.wdl.reason ?? '']?.[0] ?? '집계 중' : c.wdl.status}</Badge>
              <p className="text-xs text-ink-soft">{c.wdl.status === 'UNAVAILABLE' ? WDL_REASON[c.wdl.reason ?? '']?.[1] : c.wdl.gapMin !== null ? `같은 회차 평균보다 하루 ${c.wdl.gapMin >= 0 ? `${c.wdl.gapMin}분 더` : `${-c.wdl.gapMin}분 덜`} 공부했어요 (${c.wdl.gapPct}%).` : null}</p>
              {c.groupAvg7 !== null && <p>최근 7일 하루 평균 · 나 {c.myAvg7 ?? 0}분 / 같은 회차 {c.groupAvg7}분 <span className="text-xs text-ink-mute">(비교 표본 {c.fullSample}명)</span></p>}
              {c.ranks ? (
                <p className="font-bold text-cobalt">순위 · 오늘 {c.ranks.today ?? '–'}위 · 최근 7일 {c.ranks.recent7 ?? '–'}위 · 누적 {c.ranks.cumulative ?? '–'}위</p>
              ) : c.rankNote ? <p className="text-xs text-ink-mute">{c.rankNote}</p> : null}
              <p className="text-[11px] leading-relaxed text-ink-mute">{c.note}</p>
            </div>
          ); })()}
        </section>
      </div>

      <section className="card p-5" aria-labelledby="mission">
        <h2 id="mission" className="text-sm font-bold">오늘의 미션 · 진도 {d.record.progress}%</h2>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-line" role="progressbar" aria-valuenow={d.record.progress} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-cobalt" style={{ width: `${d.record.progress}%` }} /></div>
        <ul className="mt-3 space-y-2 text-sm">{d.record.missions.map((m) => <li key={m.id} className={m.done ? 'text-ink-mute line-through' : ''}>{m.done ? '✓' : '○'} {m.title}</li>)}</ul>
      </section>
    </div>
  );
}
