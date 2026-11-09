'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { Spinner } from './ui';

const NAV = [
  ['/admin', '대시보드·심사'], ['/admin/policy', '정책'], ['/admin/offerings', '챌린지 회차'], ['/admin/exam-rounds', '시험 일정'],
  ['/admin/open-run', '오픈런'], ['/admin/users', '회원'], ['/admin/orders', '결제'], ['/admin/audit', '감사 로그'],
];

/** 관리자 레이아웃: 역할 확인 + 메뉴. 실제 권한·MFA 강제는 서버(AuthGuard)가 담당 */
export function AdminShell({ title, children }: { title: string; children: React.ReactNode }) {
  const { me, ready } = useAuth(); const router = useRouter(); const path = usePathname();
  useEffect(() => { if (ready && (!me || me.role === 'USER')) router.replace('/'); }, [ready, me, router]);
  if (!ready || !me || me.role === 'USER') return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-lg font-black text-gold">PLIT ADMIN</span>
        <span className="text-xs text-ink-mute">{me.role === 'SUPER_ADMIN' ? '최고 관리자' : '운영자'}</span>
      </div>
      <nav aria-label="관리자 메뉴" className="-mx-4 overflow-x-auto px-4">
        <ul className="flex gap-1 whitespace-nowrap">
          {NAV.map(([href, label]) => (
            <li key={href}><Link href={href} aria-current={path === href ? 'page' : undefined} className={`block rounded-lg px-3 py-1.5 text-xs font-semibold ${path === href ? 'bg-night text-white' : 'bg-surface text-ink-soft border border-ink-line'}`}>{label}</Link></li>
          ))}
        </ul>
      </nav>
      <h1 className="text-xl font-black">{title}</h1>
      {children}
    </div>
  );
}

/** 서버 오류 코드 → 관리자 안내 (MFA 미인증 등) */
export function AdminError({ code, message }: { code?: string; message: string }) {
  return (
    <div role="alert" className="card border-risk/30 bg-risk-tint p-4 text-sm text-risk">
      {message}{code === 'MFA_REQUIRED' && <> <Link href="/my/account" className="font-semibold underline">2단계 인증 설정하기</Link> 후 다시 로그인해주세요.</>}
    </div>
  );
}

export const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }) : '–');
export const fmtDateTime = (d?: string | null) => (d ? new Date(d).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '–');
