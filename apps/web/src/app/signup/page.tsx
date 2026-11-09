'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const CONSENTS = [
  { id: 'TERMS', label: '[필수] 이용약관 동의', required: true },
  { id: 'PRIVACY', label: '[필수] 개인정보 수집·이용 동의', required: true },
  { id: 'AGE_14', label: '[필수] 만 14세 이상입니다', required: true },
  { id: 'STUDY_DATA_ANALYTICS', label: '[선택] 학습 데이터 비교 분석 활용', required: false },
  { id: 'MARKETING', label: '[선택] 이벤트·혜택 알림 수신', required: false },
];

export default function Signup() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [form, setForm] = useState({ email: '', password: '', nickname: '', referralCode: '' });
  const [inviteOfferingId, setInviteOfferingId] = useState<string | undefined>();
  useEffect(() => { // 초대 링크(/invite/CODE → /signup?ref=CODE&challengeId=…)에서 온 경우 코드 미리 채움
    const q = new URLSearchParams(window.location.search);
    const ref = q.get('ref'); if (ref) setForm((f) => ({ ...f, referralCode: ref.toUpperCase() }));
    setInviteOfferingId(q.get('challengeId') ?? undefined);
  }, []);
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const requiredOk = CONSENTS.filter((c) => c.required).every((c) => agreed[c.id]);
  const all = CONSENTS.every((c) => agreed[c.id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const r = await api<{ accessToken: string }>('/auth/signup', { method: 'POST', json: { ...form, referralCode: form.referralCode || undefined, inviteOfferingId: form.referralCode ? inviteOfferingId : undefined, consents: CONSENTS.filter((c) => agreed[c.id]).map((c) => c.id) } });
      await setSession(r.accessToken);
      router.push('/finder');
    } catch (err) { setError(err instanceof ApiError ? err.message : '가입하지 못했어요.'); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="card mx-auto max-w-md space-y-4 p-6" noValidate>
      <h1 className="text-2xl font-black">PLIT 시작하기</h1>
      <div><label htmlFor="email" className="label">이메일</label><input id="email" type="email" autoComplete="email" required className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
      <div><label htmlFor="pw" className="label">비밀번호 (영문+숫자 8자 이상)</label><input id="pw" type="password" autoComplete="new-password" minLength={8} required className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
      <div><label htmlFor="nick" className="label">닉네임 (2~12자)</label><input id="nick" required maxLength={12} className="input" value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} /></div>
      <div><label htmlFor="ref" className="label">추천 코드 (선택)</label><input id="ref" className="input" value={form.referralCode} onChange={(e) => setForm({ ...form, referralCode: e.target.value.toUpperCase() })} /></div>
      <fieldset className="space-y-2 rounded-xl bg-paper p-4 text-sm">
        <legend className="sr-only">약관 동의</legend>
        <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={all} onChange={(e) => setAgreed(Object.fromEntries(CONSENTS.map((c) => [c.id, e.target.checked])))} />전체 동의</label>
        {CONSENTS.map((c) => (
          <label key={c.id} className="flex items-center gap-2 text-ink-soft"><input type="checkbox" checked={!!agreed[c.id]} onChange={(e) => setAgreed({ ...agreed, [c.id]: e.target.checked })} />{c.label}</label>
        ))}
      </fieldset>
      {error && <p role="alert" className="text-sm text-risk">{error}</p>}
      <button className="btn-primary w-full" disabled={!requiredOk || busy}>{busy ? '가입 중…' : '가입하기'}</button>
      <p className="text-center text-xs text-ink-mute">이미 계정이 있나요? <Link href="/login" className="font-semibold text-cobalt">로그인</Link></p>
    </form>
  );
}
