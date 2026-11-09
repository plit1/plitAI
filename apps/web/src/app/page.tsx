'use client';
import Link from 'next/link';
import { useApi } from '@/lib/use-api';
import { dday } from '@/lib/api';
import { Badge, ErrorBox, FIELD_LABEL, Spinner } from '@/components/ui';

interface Offering { id: string; certId: string; certName: string; field: string; round: string; status: string; recruitDaysLeft: number; examDaysLeft: number; free: { joined: number; remaining: number }; premium: { joined: number; remaining: number } }

export default function Home() {
  const { data, error, loading, reload } = useApi<Offering[]>('/challenges?status=open');
  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl bg-night p-6 text-white sm:p-10">
        <p className="font-display text-sm font-bold tracking-widest text-clear">PLIT CHALLENGE</p>
        <h1 className="mt-2 text-3xl font-black leading-tight sm:text-4xl">자격증 취득부터<br />취업까지, 같이 깨요</h1>
        <p className="mt-3 max-w-md text-sm text-white/70">무료 플릿런으로 시작하고, 플릿 부스터 패스로 AI 학습전략까지. 합격 인증하면 보상 포인트를 받아요.</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/finder" className="btn-clear">자격증 찾기</Link>
          <Link href="/signup" className="btn bg-white/10 text-white hover:bg-white/20">무료로 시작</Link>
        </div>
      </section>

      <section aria-labelledby="popular">
        <h2 id="popular" className="mb-3 text-lg font-black">지금 모집 중인 챌린지</h2>
        {loading ? <Spinner /> : error ? <ErrorBox message={error.message} onRetry={reload} /> : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data!.slice(0, 9).map((o) => (
              <li key={o.id}>
                <Link href={`/challenges/${o.id}`} className="card block p-4 transition hover:-translate-y-0.5 hover:shadow-md">
                  <div className="flex items-center gap-2"><Badge tone="mute">{FIELD_LABEL[o.field]}</Badge><Badge tone={o.recruitDaysLeft <= 3 ? 'risk' : 'cobalt'}>모집 {dday(o.recruitDaysLeft)}</Badge></div>
                  <p className="mt-2 font-bold">{o.certName}</p>
                  <p className="text-xs text-ink-mute">{o.round} · 시험 {dday(o.examDaysLeft)}</p>
                  <p className="mt-3 text-xs text-ink-soft">도전자 {(o.free.joined + o.premium.joined).toLocaleString()}명</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
