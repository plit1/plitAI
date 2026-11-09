'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { dday, pts } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/use-api';
import { Badge, ErrorBox, Spinner } from '@/components/ui';

interface Enr { id: string; plan: string; effectivePlan: string; status: string; rewardSnapshot: number; offering: { id: string; certName: string; round: string; examDaysLeft: number }; record: { progress: number; totalMin: number; streak: number } | null; verification: { status: string } | null }

export default function My() {
  const { me, ready } = useAuth(); const router = useRouter();
  useEffect(() => { if (ready && !me) router.replace('/login?next=/my'); }, [ready, me, router]);
  const { data, error, loading, reload } = useApi<Enr[]>(me ? '/me/enrollments' : null);
  if (!ready || !me) return <Spinner />;
  return (
    <div className="space-y-5">
      <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div><p className="text-xs text-ink-mute">반가워요</p><h1 className="text-xl font-black">{me.nickname}님</h1><p className="text-xs text-ink-mute">추천 코드 <span className="font-mono font-bold text-ink">{me.referralCode}</span> · <Link href="/my/account" className="font-semibold text-cobalt">계정 설정</Link> · <Link href="/my/orders" className="font-semibold text-cobalt">결제 내역</Link></p></div>
        <Link href="/my/points" className="rounded-2xl bg-clear-tint px-4 py-3 text-right"><p className="text-xs text-clear-deep">보유 포인트</p><p className="text-lg font-black text-clear-deep">{pts(me.points)}</p></Link>
      </section>
      <section aria-labelledby="mine">
        <h2 id="mine" className="mb-2 text-lg font-black">내 챌린지</h2>
        {loading ? <Spinner /> : error ? <ErrorBox message={error.message} onRetry={reload} /> : data!.length === 0 ? (
          <p className="card p-8 text-center text-sm text-ink-mute">아직 참여한 챌린지가 없어요. <Link href="/finder" className="font-semibold text-cobalt">자격증 찾기 →</Link></p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">{data!.map((e) => (
            <li key={e.id}><Link href={`/dashboard/${e.id}`} className="card block p-4 hover:shadow-md">
              <div className="flex gap-1"><Badge tone={e.effectivePlan === 'PREMIUM' ? 'cobalt' : 'mute'}>{e.effectivePlan === 'PREMIUM' ? '부스터' : '플릿런'}</Badge><Badge tone="mute">시험 {dday(e.offering.examDaysLeft)}</Badge>{e.verification && <Badge tone="gold">{e.verification.status}</Badge>}</div>
              <p className="mt-2 font-bold">{e.offering.certName}</p><p className="text-xs text-ink-mute">{e.offering.round}</p>
              <p className="mt-2 text-xs text-ink-soft">진도 {e.record?.progress ?? 0}% · 누적 {e.record?.totalMin ?? 0}분 · 합격 보상 {pts(e.rewardSnapshot)}</p>
            </Link>{e.offering.examDaysLeft <= 0 && <Link href={`/verify/${e.id}`} className="mt-1 block text-right text-xs font-semibold text-cobalt">합격 인증하기 →</Link>}</li>
          ))}</ul>
        )}
      </section>
    </div>
  );
}
