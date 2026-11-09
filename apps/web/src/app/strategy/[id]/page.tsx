'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { Badge, ErrorBox, Spinner } from '@/components/ui';

interface Mission { id: string; title: string; minutes: number; done: boolean }
interface Strategy {
  daysLeft: number; weekMin: number; weekRequiredMin: number;
  gap: { deficit: number; extraPerDay: number; newRecommended: number; satisfied: boolean };
  weakest: { name: string; accuracy: number; gap: number } | null;
  pace: { remainingMin: number; perDayMin: number; totalHours: number };
  upToDate: boolean; previewMissions: Mission[];
  clearMode: { available: boolean; started: boolean; allocation: { review: number; weak: number; past: number; total: number } };
}
interface Coach { message: string; source: 'AI' | 'RULES'; reason?: string; remainingToday: number }

export default function StrategyPage() {
  const { id } = useParams<{ id: string }>();
  const s = useApi<Strategy>(`/enrollments/${id}/strategy`);
  const [coach, setCoach] = useState<Coach | null>(null); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  const act = async (fn: () => Promise<unknown>, ok: string) => { setMsg(null); try { await fn(); setMsg(ok); s.reload(); } catch (e) { setMsg(e instanceof ApiError ? e.message : '처리하지 못했어요.'); } };
  const askCoach = async () => { setBusy(true); try { setCoach(await api<Coach>(`/enrollments/${id}/coach`, { method: 'POST' })); } catch (e) { setMsg(e instanceof ApiError ? e.message : '코칭을 불러오지 못했어요.'); } finally { setBusy(false); } };

  if (s.loading) return <Spinner />;
  if (s.error) return <div className="space-y-2"><ErrorBox message={s.error.message} />{s.error.code === 'PREMIUM_REQUIRED' && <Link className="text-sm font-semibold text-cobalt" href={`/dashboard/${id}`}>대시보드로</Link>}</div>;
  const d = s.data!;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header className="flex items-center justify-between"><h1 className="text-2xl font-black">AI 학습전략</h1><Link href={`/dashboard/${id}`} className="text-sm text-ink-mute">대시보드</Link></header>
      {msg && <p role="status" className="rounded-xl bg-paper p-3 text-sm">{msg}</p>}

      <section className="rounded-3xl bg-night p-5 text-white" aria-label="AI 코칭">
        <div className="flex items-center justify-between"><h2 className="font-display text-xs font-bold tracking-widest text-clear">AI COACH</h2>{coach && <span className="text-[11px] text-white/60">{coach.source === 'AI' ? `AI 코칭 · 오늘 남은 횟수 ${coach.remainingToday}` : coach.reason === 'DAILY_LIMIT' ? '오늘 AI 코칭 횟수를 다 썼어요 · 기본 코칭' : '기본 코칭'}</span>}</div>
        <p className="mt-2 min-h-[3rem] text-sm leading-relaxed" aria-live="polite">{coach ? coach.message : '오늘의 학습 기록을 바탕으로 코칭을 받아보세요.'}</p>
        <button className="btn-clear mt-3" disabled={busy} onClick={askCoach}>{busy ? '생성 중…' : '코칭 받기'}</button>
        <p className="mt-2 text-[10px] text-white/50">수치는 PLIT 이 계산하고 AI 는 설명만 해요. 실제 합격 확률이 아니에요.</p>
      </section>

      <section className="card space-y-2 p-5" aria-label="이번 주 계획">
        <h2 className="font-bold">이번 주 학습량 {d.weekMin} / {d.weekRequiredMin}분</h2>
        {d.gap.satisfied ? <p className="text-sm text-clear-deep">이번 주 목표를 채웠어요.</p> : <p className="text-sm">부족한 {d.gap.deficit}분을 4일에 나눠 오늘 권장 시간을 <b>{d.gap.newRecommended}분</b>으로 올려요.</p>}
        {d.weakest && <p className="text-sm text-ink-soft">가장 약한 과목: <b>{d.weakest.name}</b> {d.weakest.accuracy}%</p>}
        <p className="text-xs text-ink-mute">남은 {d.daysLeft}일 · 하루 필요 {d.pace.perDayMin}분 · 누적 {d.pace.totalHours}시간</p>
        <ul className="space-y-1 text-sm">{d.previewMissions.map((m) => <li key={m.id} className={m.done ? 'text-ink-mute line-through' : ''}>{m.done ? '✓' : '○'} {m.title}</li>)}</ul>
        <button className="btn-primary" disabled={d.upToDate} onClick={() => act(() => api(`/enrollments/${id}/strategy/apply`, { method: 'POST' }), 'AI 학습계획을 오늘 미션에 반영했어요.')}>{d.upToDate ? '최신 계획 적용됨' : '이 계획 적용하기'}</button>
      </section>

      <section className="card space-y-2 p-5" aria-label="CLEAR MODE">
        <h2 className="font-bold">CLEAR MODE {d.clearMode.started && <Badge tone="clear">진행 중</Badge>}</h2>
        <p className="text-sm text-ink-soft">시험 7일 전부터 오답 복습 {d.clearMode.allocation.review}분 · 취약 과목 {d.clearMode.allocation.weak}분 · 기출 {d.clearMode.allocation.past}분으로 배분해요.</p>
        {!d.clearMode.started && <button className="btn-ghost border border-ink-line" disabled={!d.clearMode.available} onClick={() => act(() => api(`/enrollments/${id}/clear-mode`, { method: 'POST' }), 'CLEAR MODE 를 시작했어요.')}>{d.clearMode.available ? 'CLEAR MODE 시작' : `시험 7일 전부터 시작할 수 있어요 (D-${d.daysLeft})`}</button>}
      </section>
    </div>
  );
}
