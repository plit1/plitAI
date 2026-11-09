'use client';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { api, pts } from '@/lib/api';
import { onUnreadChanged } from '@/lib/notify';

export function Header() {
  const { me, ready, logout } = useAuth();
  return (
    <header className="sticky top-0 z-20 border-b border-ink-line/70 bg-surface/90 backdrop-blur">
      <nav aria-label="주요 메뉴" className="mx-auto flex h-14 max-w-5xl items-center gap-3 overflow-x-auto whitespace-nowrap px-4 sm:gap-4">
        <Link href="/" className="font-display text-xl font-black tracking-tight text-cobalt">PLIT</Link>
        <Link href="/finder" className="text-sm font-semibold text-ink-soft hover:text-ink">자격증찾기</Link>
        <Link href="/community" className="text-sm font-semibold text-ink-soft hover:text-ink">커뮤니티</Link>
        <Link href="/jobs" className="text-sm font-semibold text-ink-soft hover:text-ink">취업</Link>
        <Link href="/startup" className="text-sm font-semibold text-ink-soft hover:text-ink">창업</Link>
        <Link href="/mall" className="text-sm font-semibold text-ink-soft hover:text-ink">포인트몰</Link>
        <Link href="/open-run" className="hidden text-sm font-semibold text-ink-soft hover:text-ink sm:inline">오픈런</Link>
        <Link href="/my" className="text-sm font-semibold text-ink-soft hover:text-ink">내 챌린지</Link>
        <div className="ml-auto flex items-center gap-2 text-sm">
          {!ready ? null : me ? (
            <>
              <Bell />
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

/** 알림 아이콘 + 미읽음 수 (화면 이동·읽음 처리 시 갱신) */
function Bell() {
  const [n, setN] = useState(0); const path = usePathname();
  useEffect(() => {
    const load = () => { api<{ unread: number }>('/me/notifications/unread').then((r) => setN(r.unread)).catch(() => undefined); };
    load(); return onUnreadChanged(load);
  }, [path]);
  return (
    <Link href="/notifications" aria-label={`알림${n ? ` ${n}개 읽지 않음` : ''}`} className="relative text-ink-soft hover:text-ink">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" /></svg>
      {n > 0 && <span className="absolute -right-2 -top-1 rounded-full bg-risk px-1 text-[10px] font-bold text-white" data-testid="unread-count">{n > 99 ? '99+' : n}</span>}
    </Link>
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

/** 접수·모집 상태 (취업 공고·창업 지원사업 공용) */
export const LIFE: Record<string, [string, 'cobalt' | 'clear' | 'gold' | 'mint' | 'risk' | 'mute']> = {
  OPEN: ['모집 중', 'clear'], ACTIVE: ['모집 중', 'clear'], ARCHIVED: ['보관', 'mute'], ALWAYS: ['상시 모집', 'cobalt'], CLOSING_SOON: ['마감 임박', 'gold'], UPCOMING: ['접수 예정', 'cobalt'], EXPIRED: ['마감', 'mute'], HIDDEN: ['숨김', 'mute'],
};
export const MATCH: Record<string, [string, 'cobalt' | 'clear' | 'gold' | 'mint' | 'risk' | 'mute']> = { HIGH: ['맞춤도 높음', 'clear'], MID: ['맞춤도 보통', 'cobalt'], LOW: ['맞춤도 낮음', 'mute'], CLOSED: ['마감', 'mute'] };
export const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" aria-pressed={on} onClick={onClick} className={`rounded-full border px-3 py-1 text-xs font-semibold ${on ? 'border-cobalt bg-cobalt text-white' : 'border-ink-line bg-surface text-ink-soft'}`}>{children}</button>
);
