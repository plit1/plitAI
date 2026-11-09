'use client';
import Link from 'next/link';
import { useState } from 'react';
import { pts } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { useRequireLogin } from '@/lib/use-login';
import { Badge, ErrorBox, Spinner } from '@/components/ui';

interface Ref {
  code: string; eligible: boolean; link: string; policy: { reward: number; monthlyCount: number; monthlyPoints: number };
  month: { month: string; count: number; points: number }; stats: { invited: number; joined: number; pending: number; rewarded: number };
  friends: { alias: string; joinedAt: string; step: string; amount: number | null }[]; rules: string[];
}
const STEP: Record<string, [string, 'mute' | 'cobalt' | 'gold' | 'clear' | 'risk']> = { SIGNED_UP: ['가입', 'mute'], ENROLLED: ['챌린지 참여', 'cobalt'], PENDING_APPROVAL: ['보상 확인 중', 'gold'], REWARDED: ['보상 지급', 'clear'], REJECTED: ['보상 대상 아님', 'risk'] };

export default function Referral() {
  const { ready } = useRequireLogin('/referral');
  const { data: r, error, loading, reload } = useApi<Ref>(ready ? '/me/referral' : null);
  const [copied, setCopied] = useState(false);
  if (!ready || loading) return <Spinner />;
  if (error) return <ErrorBox message={error.message} onRetry={reload} />;
  if (!r) return null;
  const copy = async () => { try { await navigator.clipboard.writeText(r.link); setCopied(true); } catch { setCopied(false); } };
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">친구와 함께하기</h1>
      <section className="card space-y-3 p-5" aria-labelledby="link">
        <h2 id="link" className="text-sm font-bold">내 초대 링크</h2>
        {r.eligible ? (
          <>
            <div className="flex gap-2"><input className="input font-mono text-xs" readOnly value={r.link} aria-label="초대 링크" /><button className="btn-primary shrink-0" onClick={copy}>{copied ? '복사됨' : '복사'}</button></div>
            <p className="text-xs text-ink-mute">초대 코드 <span className="font-mono font-bold text-ink">{r.code}</span></p>
          </>
        ) : <p className="text-sm text-ink-soft">챌린지에 참여 중인 회원만 친구를 초대할 수 있어요. <Link href="/finder" className="font-semibold text-cobalt">챌린지 찾기 →</Link></p>}
        <p className="text-sm">친구가 첫 학습을 마치면 <b className="text-cobalt">{pts(r.policy.reward)}</b> · 이번 달 {r.month.count}/{r.policy.monthlyCount}건 · {pts(r.month.points)}/{pts(r.policy.monthlyPoints)}</p>
      </section>
      <section className="grid grid-cols-4 gap-2 text-center" aria-label="초대 현황">
        {[['초대 가입', r.stats.invited], ['참여', r.stats.joined], ['확인 중', r.stats.pending], ['지급', r.stats.rewarded]].map(([l, v]) => <div key={l} className="card p-3"><p className="text-xs text-ink-mute">{l}</p><p className="text-lg font-black">{v}</p></div>)}
      </section>
      <section className="card p-5" aria-labelledby="friends">
        <h2 id="friends" className="text-sm font-bold">초대한 친구</h2>
        {r.friends.length === 0 ? <p className="mt-2 text-sm text-ink-mute">아직 초대로 가입한 친구가 없어요.</p> : (
          <ul className="mt-2 divide-y divide-ink-line/60">{r.friends.map((f) => <li key={f.alias + f.joinedAt} className="flex items-center justify-between py-2 text-sm"><span className="font-mono">{f.alias}</span><Badge tone={STEP[f.step][1]}>{STEP[f.step][0]}{f.step === 'REWARDED' && f.amount ? ` +${pts(f.amount)}` : ''}</Badge></li>)}</ul>
        )}
      </section>
      <ul className="space-y-1 text-xs text-ink-mute">{r.rules.map((x) => <li key={x}>· {x}</li>)}</ul>
    </div>
  );
}
