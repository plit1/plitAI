'use client';
import { useState } from 'react';
import { api, ApiError, setAccessToken } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useRequireLogin } from '@/lib/use-login';
import { Spinner } from '@/components/ui';

/** 비밀번호 변경. 임시 비밀번호 계정은 로그인 직후 이 화면으로 강제 이동 */
export default function ChangePassword() {
  const { ready } = useRequireLogin('/my/password'); const { me } = useAuth();
  const [f, setF] = useState({ current: '', next: '', confirm: '' }); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  if (!ready || !me) return <Spinner />;
  const forced = !!me.passwordChangeRequired;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    if (f.next !== f.confirm) return setErr('새 비밀번호가 서로 달라요.');
    setBusy(true);
    try {
      await api('/auth/password/change', { method: 'POST', json: { currentPassword: f.current, newPassword: f.next } });
      // 모든 기기 로그아웃됨 → 새 비밀번호로 다시 로그인. 화면 전체를 새로 열어 '로그인 필요' 이동과 겹치지 않게 함
      setAccessToken(null);
      window.location.replace(`/login?next=${encodeURIComponent(me.role === 'USER' ? '/my' : '/my/account')}&changed=1`);
    } catch (e2) { setErr(e2 instanceof ApiError ? e2.message : '바꾸지 못했어요.'); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="card mx-auto max-w-md space-y-4 p-6" noValidate>
      <h1 className="text-2xl font-black">비밀번호 변경</h1>
      {forced && <p role="alert" className="rounded-xl bg-gold-tint p-3 text-sm text-gold">임시 비밀번호로 로그인했어요. 계속하려면 새 비밀번호로 바꿔주세요.{me.role !== 'USER' && ' 바꾼 뒤 다시 로그인해서 2단계 인증(OTP)을 등록하면 관리자 기능을 쓸 수 있어요.'}</p>}
      <div><label htmlFor="cur" className="label">현재 비밀번호{forced ? ' (임시 비밀번호)' : ''}</label><input id="cur" type="password" autoComplete="current-password" className="input" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} /></div>
      <div><label htmlFor="new" className="label">새 비밀번호 (영문+숫자 8자 이상)</label><input id="new" type="password" autoComplete="new-password" className="input" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} /></div>
      <div><label htmlFor="new2" className="label">새 비밀번호 확인</label><input id="new2" type="password" autoComplete="new-password" className="input" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></div>
      {err && <p role="alert" className="text-sm text-risk">{err}</p>}
      <button className="btn-primary w-full" disabled={busy || !f.current || !f.next}>{busy ? '바꾸는 중…' : '비밀번호 바꾸기'}</button>
      <p className="text-xs text-ink-mute">바꾸면 모든 기기에서 로그아웃되고 새 비밀번호로 다시 로그인해요.</p>
    </form>
  );
}
