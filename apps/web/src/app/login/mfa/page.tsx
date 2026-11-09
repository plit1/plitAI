'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** 소셜 로그인 + 2단계 인증: 서버가 URL 조각(#token=)으로 넘긴 단계 토큰으로 OTP 입력 (조각은 서버 로그에 남지 않음) */
export default function SocialMfa() {
  const router = useRouter(); const { setSession } = useAuth();
  const [token, setToken] = useState<string | null>(null); const [next, setNext] = useState('/my');
  const [code, setCode] = useState(''); const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.slice(1));
    setToken(h.get('token')); const n = h.get('next'); if (n?.startsWith('/')) setNext(n);
    history.replaceState(null, '', window.location.pathname);
  }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    try { const r = await api<{ accessToken: string }>('/auth/login/mfa', { method: 'POST', json: { mfaToken: token, code } }); await setSession(r.accessToken); router.replace(next); }
    catch (err) { setError(err instanceof ApiError ? err.message : '인증하지 못했어요.'); }
  };
  if (!token) return <p className="card mx-auto max-w-md p-6 text-sm text-ink-mute">인증 요청이 없어요. 다시 로그인해주세요.</p>;
  return (
    <form onSubmit={submit} className="card mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-xl font-black">2단계 인증</h1>
      <label htmlFor="otp" className="label">인증 앱의 6자리 코드</label>
      <input id="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="input tracking-[0.4em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
      {error && <p role="alert" className="text-sm text-risk">{error}</p>}
      <button className="btn-primary w-full">인증하고 로그인</button>
    </form>
  );
}
