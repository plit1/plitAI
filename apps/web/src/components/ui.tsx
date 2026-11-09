'use client';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { pts } from '@/lib/api';

export function Header() {
  const { me, ready, logout } = useAuth();
  return (
    <header className="sticky top-0 z-20 border-b border-ink-line/70 bg-surface/90 backdrop-blur">
      <nav aria-label="주요 메뉴" className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
        <Link href="/" className="font-display text-xl font-black tracking-tight text-cobalt">PLIT</Link>
        <Link href="/finder" className="text-sm font-semibold text-ink-soft hover:text-ink">자격증찾기</Link>
        <Link href="/open-run" className="hidden text-sm font-semibold text-ink-soft hover:text-ink sm:inline">오픈런</Link>
        <Link href="/my" className="text-sm font-semibold text-ink-soft hover:text-ink">내 챌린지</Link>
        <div className="ml-auto flex items-center gap-2 text-sm">
          {!ready ? null : me ? (
            <>
              <Link href="/my/points" className="rounded-full bg-clear-tint px-3 py-1 font-semibold text-clear-deep">{pts(me.points)}</Link>
              {me.role !== 'USER' && <Link href="/admin" className="font-semibold text-gold">관리자</Link>}
              <button onClick={logout} className="text-ink-mute hover:text-ink">로그아웃</button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-ink-soft hover:text-ink">로그인</Link>
              <Link href="/signup" className="rounded-xl bg-cobalt px-3 py-1.5 font-semibold text-white">시작하기</Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

export const Spinner = ({ label = '불러오는 중' }: { label?: string }) => (
  <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-ink-mute">
    <span className="h-4 w-4 animate-spin rounded-full border-2 border-cobalt border-t-transparent" aria-hidden />{label}…
  </div>
);
export const ErrorBox = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div role="alert" className="card flex items-center justify-between gap-3 border-risk/30 bg-risk-tint p-4 text-sm text-risk">
    <span>{message}</span>{onRetry && <button className="font-semibold underline" onClick={onRetry}>다시 시도</button>}
  </div>
);
export const Badge = ({ children, tone = 'cobalt' }: { children: React.ReactNode; tone?: 'cobalt' | 'clear' | 'gold' | 'mint' | 'risk' | 'mute' }) => {
  const m = { cobalt: 'bg-cobalt-tint text-cobalt', clear: 'bg-clear-tint text-clear-deep', gold: 'bg-gold-tint text-gold', mint: 'bg-mint-tint text-mint', risk: 'bg-risk-tint text-risk', mute: 'bg-ink-line/50 text-ink-soft' };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${m[tone]}`}>{children}</span>;
};
export const FIELD_LABEL: Record<string, string> = { care: '돌봄·건강', beauty: '뷰티', food: '카페·푸드', life: '라이프', office: '사무·IT', edu: '교육', biz: '비즈니스', lang: '어학' };

/** 오픈런 상태 라벨 */
export const OR_STATUS: Record<string, [string, 'cobalt' | 'clear' | 'gold' | 'mint' | 'risk' | 'mute']> = {
  PENDING_REVIEW: ['검토 대기', 'mute'], COLLECTING: ['모집 중', 'cobalt'], THRESHOLD_REACHED: ['목표 달성 · 개설 심사 대기', 'clear'],
  UNDER_REVIEW: ['개설 검토 중', 'gold'], OPENED: ['개설됨', 'mint'], REJECTED: ['반려', 'risk'],
};
