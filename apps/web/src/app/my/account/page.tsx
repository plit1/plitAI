'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/use-api';
import { ErrorBox, Spinner } from '@/components/ui';

const PROVIDER: Record<string, string> = { EMAIL: '이메일', KAKAO: '카카오', NAVER: '네이버', GOOGLE: 'Google' };
const OPTIONAL = [['STUDY_DATA_ANALYTICS', '학습 데이터 비교 분석 활용'], ['MARKETING', '이벤트·혜택 알림 수신']] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="card space-y-3 p-5" aria-label={title}><h2 className="font-bold">{title}</h2>{children}</section>;
}

function Account() {
  const { me, ready, reload, logout } = useAuth(); const router = useRouter(); const sp = useSearchParams();
  useEffect(() => { if (ready && !me) router.replace('/login?next=/my/account'); }, [ready, me, router]);
  const consents = useApi<{ type: string; agreed: boolean }[]>(me ? '/me/consents' : null);
  const ids = useApi<{ provider: string; email: string | null }[]>(me ? '/me/identities' : null);
  const providers = useApi<{ social: string[] }>('/auth/providers');
  const mfa = useApi<{ enabled: boolean }>(me ? '/auth/mfa' : null);
  const [nick, setNick] = useState(''); const [msg, setMsg] = useState<string | null>(sp.get('linked') ? `${PROVIDER[sp.get('linked')!] ?? ''} 계정을 연결했어요.` : null);
  const [err, setErr] = useState<string | null>(null);
  const [enroll, setEnroll] = useState<{ secret: string; otpauthUrl: string } | null>(null); const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({}); // 동의 토글 즉시 반영 (요청 중 비활성)
  useEffect(() => { if (me) setNick(me.nickname); }, [me]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setErr(null); setMsg(null);
    try { await fn(); setMsg(ok); } catch (e) { setErr(e instanceof ApiError ? e.message : '처리하지 못했어요.'); }
  };
  if (!ready || !me) return <Spinner />;
  const linked = new Set((ids.data ?? []).map((i) => i.provider));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-end justify-between"><h1 className="text-2xl font-black">계정 설정</h1><a href="/my/password" className="text-sm font-semibold text-cobalt">비밀번호 변경</a></div>
      {msg && <p role="status" className="rounded-xl bg-clear-tint p-3 text-sm text-clear-deep">{msg}</p>}
      {err && <ErrorBox message={err} />}

      <Section title="프로필">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await api('/me', { method: 'PATCH', json: { nickname: nick } }); await reload(); }, '닉네임을 바꿨어요.'); }}>
          <label htmlFor="nick" className="sr-only">닉네임</label>
          <input id="nick" className="input" value={nick} maxLength={12} onChange={(e) => setNick(e.target.value)} />
          <button className="btn-primary shrink-0">저장</button>
        </form>
        <p className="text-xs text-ink-mute">이메일 {me.email ?? '없음 (소셜 가입)'}</p>
      </Section>

      <Section title="선택 동의">
        {consents.loading && !consents.data ? <Spinner /> : OPTIONAL.map(([type, label]) => {
          const server = !!consents.data?.find((c) => c.type === type)?.agreed;
          const pending = type in optimistic;
          const on = pending ? optimistic[type] : server;
          const toggle = async () => {
            setOptimistic((o) => ({ ...o, [type]: !on }));
            await run(async () => { await api('/me/consents', { method: 'POST', json: { type, agreed: !on } }); await consents.reload(); }, on ? '동의를 철회했어요.' : '동의했어요.');
            setOptimistic((o) => { const n = { ...o }; delete n[type]; return n; }); // 실패 시 서버 값으로 복귀
          };
          return (
            <label key={type} className="flex items-center justify-between text-sm">
              {label}
              <input type="checkbox" checked={on} disabled={pending} aria-busy={pending} onChange={toggle} />
            </label>
          );
        })}
        <p className="text-xs text-ink-mute">필수 동의(이용약관·개인정보·만 14세)는 회원 탈퇴로만 철회할 수 있어요.</p>
      </Section>

      <Section title="로그인 연결">
        <ul className="space-y-2 text-sm">
          {['EMAIL', ...(providers.data?.social ?? [])].map((p) => (
            <li key={p} className="flex items-center justify-between">
              <span>{PROVIDER[p]} {linked.has(p) ? <span className="text-xs text-clear-deep">연결됨</span> : <span className="text-xs text-ink-mute">미연결</span>}</span>
              {p !== 'EMAIL' && (linked.has(p)
                ? <button className="btn-ghost px-3 py-1.5" onClick={() => run(async () => { await api(`/me/identities/${p.toLowerCase()}`, { method: 'DELETE' }); await ids.reload(); }, `${PROVIDER[p]} 연결을 해제했어요.`)}>해제</button>
                : <button className="btn-ghost border border-ink-line px-3 py-1.5" onClick={() => run(async () => { const r = await api<{ url: string }>(`/me/identities/${p.toLowerCase()}/link`, { method: 'POST' }); window.location.href = r.url; }, '이동 중…')}>연결</button>)}
            </li>
          ))}
        </ul>
        {(providers.data?.social.length ?? 0) === 0 && <p className="text-xs text-ink-mute">소셜 로그인은 준비 중이에요.</p>}
      </Section>

      <Section title="2단계 인증 (OTP)">
        {mfa.loading ? <Spinner /> : mfa.data?.enabled ? (
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await api('/auth/mfa/disable', { method: 'POST', json: { code } }); setCode(''); await logout(); router.push('/login'); }, '해제했어요. 다시 로그인해주세요.'); }}>
            <p className="text-sm text-clear-deep">사용 중이에요. 해제하면 모든 기기에서 로그아웃돼요.</p>
            <div className="flex gap-2"><label htmlFor="off" className="sr-only">현재 코드</label><input id="off" inputMode="numeric" maxLength={6} placeholder="현재 6자리 코드" className="input" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /><button className="btn-ghost shrink-0 border border-ink-line">해제</button></div>
          </form>
        ) : enroll ? (
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await api('/auth/mfa/confirm', { method: 'POST', json: { code } }); setEnroll(null); setCode(''); await mfa.reload(); }, '2단계 인증을 켰어요. 다음 로그인부터 코드를 입력해요.'); }}>
            <p className="text-sm">인증 앱(Google Authenticator 등)에서 <b>키 직접 입력</b>을 선택하고 아래 키를 입력하세요.</p>
            <p className="break-all rounded-xl bg-paper p-3 font-mono text-sm" aria-label="설정 키">{enroll.secret.replace(/(.{4})/g, '$1 ').trim()}</p>
            <a href={enroll.otpauthUrl} className="text-xs text-cobalt underline">이 기기의 인증 앱으로 열기</a>
            <div className="flex gap-2"><label htmlFor="on" className="sr-only">앱에 표시된 코드</label><input id="on" inputMode="numeric" maxLength={6} placeholder="앱에 표시된 6자리" className="input" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /><button className="btn-primary shrink-0">확인</button></div>
          </form>
        ) : (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-ink-soft">{me.role !== 'USER' ? '관리자 기능을 쓰려면 반드시 켜야 해요.' : '로그인할 때 인증 앱 코드를 한 번 더 확인해요.'}</span>
            <button className="btn-primary shrink-0" onClick={() => run(async () => setEnroll(await api('/auth/mfa/enroll', { method: 'POST' })), '인증 앱에 키를 등록해주세요.')}>설정</button>
          </div>
        )}
      </Section>

      <Section title="회원 탈퇴">
        <p className="text-sm text-ink-soft">탈퇴하면 개인정보는 즉시 익명화돼요. 결제·포인트 기록은 관련 법령에 따라 일정 기간 보관 후 파기돼요.</p>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await api('/me', { method: 'DELETE', json: { confirm } }); await logout(); router.push('/'); }, '탈퇴했어요.'); }}>
          <label htmlFor="bye" className="sr-only">확인 문구</label>
          <input id="bye" className="input" placeholder='"탈퇴합니다" 입력' value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <button className="btn shrink-0 bg-risk text-white" disabled={confirm !== '탈퇴합니다'}>탈퇴</button>
        </form>
      </Section>
    </div>
  );
}
export default function Page() { return <Suspense><Account /></Suspense>; }
