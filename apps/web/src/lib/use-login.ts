'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from './auth';

/** 로그인이 필요한 화면: 비로그인이면 로그인으로 보낸 뒤 돌아오게 함 */
export function useRequireLogin(next: string) {
  const { me, ready } = useAuth(); const router = useRouter();
  useEffect(() => { if (ready && !me) router.replace(`/login?next=${encodeURIComponent(next)}`); }, [ready, me, router, next]);
  return { me, ready: ready && !!me };
}
