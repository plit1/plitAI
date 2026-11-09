'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError, dday, pts, won } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/use-api';
import { Badge, ErrorBox, Spinner } from '@/components/ui';

interface Detail {
  id: string; certName: string; round: string; status: string; recruitDaysLeft: number; examDaysLeft: number; examDate: string; durationDays: number;
  free: { cap: number; joined: number; remaining: number }; premium: { cap: number; joined: number; remaining: number };
  cert: { name: string; issuer: string; passRule: string; subjects: string[]; tagline: string };
  policy: { passPrice: number; rewards: { FREE: number; PREMIUM: number } };
}

export default function ChallengeDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { me } = useAuth();
  const { data: o, error, loading, reload } = useApi<Detail>(`/challenges/${id}`);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);

  const joinFree = async () => {
    if (!me) return router.push(`/login?next=/challenges/${id}`);
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ enrollment: { id: string } }>(`/challenges/${id}/join`, { method: 'POST', json: { plan: 'FREE' } });
      router.push(`/dashboard/${r.enrollment.id}`);
    } catch (e) { setMsg(e instanceof ApiError ? e.message : '참여하지 못했어요.'); } finally { setBusy(false); }
  };
  const buy = () => (me ? router.push(`/checkout/${id}`) : router.push(`/login?next=/checkout/${id}`));

  if (loading) return <Spinner />;
  if (error || !o) return <ErrorBox message={error?.message ?? '챌린지를 찾을 수 없어요.'} onRetry={reload} />;
  const open = o.status === 'open';
  return (
    <article className="space-y-5">
      <header className="card p-6">
        <div className="flex gap-2"><Badge tone={open ? 'cobalt' : 'mute'}>{open ? `모집 ${dday(o.recruitDaysLeft)}` : '모집 마감'}</Badge><Badge tone="mute">{o.round}</Badge></div>
        <h1 className="mt-2 text-2xl font-black">{o.cert.name} 챌린지</h1>
        <p className="mt-1 text-sm text-ink-soft">{o.cert.tagline}</p>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl bg-paper p-3"><dt className="text-ink-mute">시험일</dt><dd className="mt-1 font-bold">{new Date(o.examDate).toLocaleDateString('ko-KR')}</dd></div>
          <div className="rounded-xl bg-paper p-3"><dt className="text-ink-mute">기간</dt><dd className="mt-1 font-bold">{o.durationDays}일</dd></div>
          <div className="rounded-xl bg-paper p-3"><dt className="text-ink-mute">시행</dt><dd className="mt-1 font-bold">{o.cert.issuer}</dd></div>
        </dl>
      </header>

      {msg && <ErrorBox message={msg} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <section className="card p-5" aria-labelledby="free">
          <p className="font-display text-xs font-bold tracking-widest text-ink-mute">PLIT RUN</p>
          <h2 id="free" className="text-lg font-black">플릿런 · 무료</h2>
          <ul className="mt-3 space-y-1 text-sm text-ink-soft"><li>· 기본 학습관리 · 오늘공부</li><li>· 기본 PLIT 도전 지표(추정)</li><li>· 회차 스터디룸 · 커뮤니티</li><li>· 합격 인증 시 {pts(o.policy.rewards.FREE)}</li></ul>
          <p className="mt-3 text-xs text-ink-mute">잔여 {o.free.remaining} / {o.free.cap}</p>
          <button className="btn-ghost mt-3 w-full border border-ink-line" disabled={!open || busy || o.free.remaining === 0} onClick={joinFree}>{o.free.remaining === 0 ? '정원 마감' : '무료로 참여'}</button>
        </section>
        <section className="card border-cobalt/40 p-5 ring-2 ring-cobalt/10" aria-labelledby="premium">
          <p className="font-display text-xs font-bold tracking-widest text-cobalt">PLIT BOOSTER PASS</p>
          <h2 id="premium" className="text-lg font-black">플릿 부스터 패스 · {won(o.policy.passPrice)}</h2>
          <ul className="mt-3 space-y-1 text-sm text-ink-soft"><li>· 플릿런 전체 기능</li><li>· QUICK TEST 실력점검 · 취약과목 분석</li><li>· AI 학습전략 · CLEAR MODE · 상세 순위</li><li>· 합격 인증 시 {pts(o.policy.rewards.PREMIUM)}</li></ul>
          <p className="mt-3 text-xs text-ink-mute">시험 회차당 1회 · VAT 포함 · 잔여 {o.premium.remaining} / {o.premium.cap}</p>
          <button className="btn-primary mt-3 w-full" disabled={busy || o.premium.remaining === 0} onClick={buy}>부스터 패스 구매</button>
        </section>
      </div>
      <section className="card p-5 text-sm">
        <h2 className="font-bold">합격 기준</h2><p className="mt-1 text-ink-soft">{o.cert.passRule}</p>
        <h2 className="mt-4 font-bold">과목</h2><p className="mt-1 text-ink-soft">{o.cert.subjects.join(' · ')}</p>
      </section>
      <p className="text-center text-xs text-ink-mute">포인트 보상은 현재 테스트(가상 포인트) 단계예요. <Link className="underline" href="/finder">다른 자격증 보기</Link></p>
    </article>
  );
}
