'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

function LoginForm() {
  const router = useRouter(); const sp = useSearchParams();
  const next = sp.get('next')?.startsWith('/') ? sp.get('next')! : '/my';
  const { setSession } = useAuth();
  const [mfaToken, setMfaToken] = useState<string | null>(null); const [otp, setOtp] = useState('');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(sp.get('error') ? '소셜 로그인에 실패했어요. 다시 시도해주세요.' : null);
  const [busy, setBusy] = useState(false); const [social, setSocial] = useState<string[]>([]); const [agree, setAgree] = useState(false);
  useEffect(() => { api<{ social: string[] }>('/auth/providers').then((r) => setSocial(r.social)).catch(() => {}); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      if (mfaToken) {
        const r = await api<{ accessToken: string }>('/auth/login/mfa', { method: 'POST', json: { mfaToken, code: otp } });
        await setSession(r.accessToken); router.push(next); return;
      }
      const r = await api<{ accessToken?: string; mfaRequired?: boolean; mfaToken?: string }>('/auth/login', { method: 'POST', json: { email, password } });
      if (r.mfaRequired && r.mfaToken) { setMfaToken(r.mfaToken); return; }
      await setSession(r.accessToken!); router.push(next);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'MFA_TOKEN_INVALID') setMfaToken(null);
      setError(err instanceof ApiError ? err.message : '로그인하지 못했어요.');
    } finally { setBusy(false); }
  };
  const SOCIAL: Record<string, string> = { KAKAO: '카카오로 시작', NAVER: '네이버로 시작', GOOGLE: 'Google로 시작' };
  return (
    <form onSubmit={submit} className="card mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-2xl font-black">로그인</h1>
      {sp.get('changed') && <p role="status" className="rounded-xl bg-clear-tint p-3 text-sm text-clear-deep">비밀번호를 바꿨어요. 새 비밀번호로 다시 로그인해주세요.</p>}
      {mfaToken ? (
        <div>
          <label htmlFor="otp" className="label">인증 앱의 6자리 코드</label>
          <input id="otp" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} autoFocus className="input tracking-[0.4em]" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} required />
          <p className="mt-1 text-xs text-ink-mute">2단계 인증이 켜진 계정이에요. 5분 안에 입력해주세요.</p>
        </div>
      ) : (
        <>
          <div><label htmlFor="email" className="label">이메일</label><input id="email" type="email" autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div><label htmlFor="pw" className="label">비밀번호</label><input id="pw" type="password" autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        </>
      )}
      {error && <p role="alert" className="text-sm text-risk">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? '확인 중…' : mfaToken ? '인증하고 로그인' : '로그인'}</button>
      {!mfaToken && social.length > 0 && (
        <div className="space-y-2 border-t border-ink-line pt-4">
          <label className="flex items-start gap-2 text-xs text-ink-soft"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />소셜 계정으로 처음 가입하는 경우, [필수] 이용약관·개인정보 수집·이용에 동의하며 만 14세 이상입니다.</label>
          {social.map((p) => (
            <button type="button" key={p} disabled={!agree} className="btn-ghost w-full border border-ink-line" onClick={() => { window.location.href = `/api/v1/auth/oauth/${p.toLowerCase()}/start?consents=TERMS,PRIVACY,AGE_14&redirect=${encodeURIComponent(next)}`; }}>{SOCIAL[p]}</button>
          ))}
        </div>
      )}
      <p className="text-center text-xs text-ink-mute">처음이신가요? <Link href="/signup" className="font-semibold text-cobalt">회원가입</Link></p>
    </form>
  );
}
export default function Login() { return <Suspense><LoginForm /></Suspense>; }
