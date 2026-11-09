'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { refresh } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Spinner } from '@/components/ui';

/** 소셜 로그인 완료: 서버가 심어준 refresh 쿠키로 access 토큰을 받아 세션 복원 */
function Callback() {
  const router = useRouter(); const sp = useSearchParams(); const { reload } = useAuth();
  useEffect(() => {
    const next = sp.get('next')?.startsWith('/') ? sp.get('next')! : '/my';
    refresh().then(async (ok) => { await reload(); router.replace(ok ? next : '/login?error=OAUTH_FAILED'); });
  }, [sp, reload, router]);
  return <Spinner label="로그인 처리 중" />;
}
export default function Page() { return <Suspense><Callback /></Suspense>; }
