'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { pts } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/use-api';
import { Spinner } from '@/components/ui';

export default function Invite() {
  const { code } = useParams<{ code: string }>(); const { me } = useAuth();
  const challengeId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('challengeId') : null;
  const { data, loading } = useApi<{ valid: boolean; code?: string; inviter?: string; welcomePoints?: number }>(`/referral/${encodeURIComponent(code)}`);
  if (loading || !data) return <Spinner />;
  if (!data.valid) return <p className="card mx-auto max-w-md p-6 text-center text-sm">유효하지 않은 초대 링크예요. <Link href="/" className="font-semibold text-cobalt">PLIT 둘러보기</Link></p>;
  const q = new URLSearchParams({ ref: data.code! }); if (challengeId) q.set('challengeId', challengeId);
  return (
    <section className="card mx-auto max-w-md space-y-4 p-6 text-center">
      <p className="text-sm text-ink-soft"><b>{data.inviter}</b> 님이 PLIT 에 초대했어요</p>
      <h1 className="text-2xl font-black">같이 자격증 챌린지 해요</h1>
      <p className="text-sm text-ink-soft">가입하면 가입 축하 {pts(data.welcomePoints ?? 0)} 를 드려요. 친구와 함께 공부 기록을 쌓아보세요.</p>
      {me ? (
        <p className="text-sm text-ink-mute">이미 가입한 회원은 추천 관계가 생기지 않아요. <Link href="/finder" className="font-semibold text-cobalt">챌린지 보러 가기</Link></p>
      ) : (
        <Link href={`/signup?${q}`} className="btn-primary inline-flex w-full justify-center">가입하고 시작하기</Link>
      )}
      <p className="text-xs text-ink-mute">초대 코드 {data.code}</p>
    </section>
  );
}
