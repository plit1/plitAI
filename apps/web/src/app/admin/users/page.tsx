'use client';
import { useState } from 'react';
import { api, ApiError, pts } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/use-api';
import { Badge, Spinner } from '@/components/ui';
import { AdminError, AdminShell, fmtDate } from '@/components/admin';

interface U { id: string; email: string | null; nickname: string; role: string; status: string; createdAt: string; isTest: boolean }

export default function Users() {
  const { me } = useAuth(); const isSuper = me?.role === 'SUPER_ADMIN';
  const [q, setQ] = useState(''); const [applied, setApplied] = useState('');
  const list = useApi<U[]>(`/admin/users${applied ? `?q=${encodeURIComponent(applied)}` : ''}`);
  const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<{ code?: string; message: string } | null>(null);
  const run = async (fn: () => Promise<string>) => { setErr(null); setMsg(null); try { setMsg(await fn()); list.reload(); } catch (e) { setErr(e instanceof ApiError ? e : { message: '처리하지 못했어요.' }); } };
  const ask = (label: string) => window.prompt(`${label} 사유 (감사 로그에 남아요)`);

  return (
    <AdminShell title="회원 관리">
      <form role="search" className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setApplied(q.trim()); }}>
        <label htmlFor="uq" className="sr-only">회원 검색</label><input id="uq" className="input" placeholder="이메일·닉네임·회원 ID" value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn-primary shrink-0">검색</button>
      </form>
      {msg && <p role="status" className="text-sm text-clear-deep">{msg}</p>}{err && <AdminError code={err.code} message={err.message} />}
      {list.loading ? <Spinner /> : list.error ? <AdminError code={list.error.code} message={list.error.message} /> : (
        <ul className="space-y-2">{list.data!.map((u) => (
          <li key={u.id} className="card flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
            <div>
              <p className="font-bold">{u.nickname} <Badge tone={u.role === 'USER' ? 'mute' : 'gold'}>{u.role}</Badge> <Badge tone={u.status === 'ACTIVE' ? 'clear' : 'risk'}>{u.status}</Badge>{u.isTest && <Badge tone="mute">TEST</Badge>}</p>
              <p className="text-xs text-ink-mute">{u.email ?? '이메일 없음'} · 가입 {fmtDate(u.createdAt)} · <span className="font-mono">{u.id}</span></p>
            </div>
            {u.id !== me?.id && u.status !== 'WITHDRAWN' && (
              <div className="flex flex-wrap gap-1 text-xs">
                {u.status === 'ACTIVE'
                  ? <button className="btn-ghost px-3 py-1.5 text-risk" onClick={() => { const r = ask('이용 정지'); if (r) run(async () => { await api(`/admin/users/${u.id}/status`, { method: 'PATCH', json: { status: 'SUSPENDED', reason: r } }); return `${u.nickname} 정지`; }); }}>정지</button>
                  : <button className="btn-ghost px-3 py-1.5" onClick={() => { const r = ask('정지 해제'); if (r) run(async () => { await api(`/admin/users/${u.id}/status`, { method: 'PATCH', json: { status: 'ACTIVE', reason: r } }); return `${u.nickname} 정지 해제`; }); }}>정지 해제</button>}
                {isSuper && <>
                  <label className="sr-only" htmlFor={`role-${u.id}`}>{u.nickname} 역할</label>
                  <select id={`role-${u.id}`} className="rounded border border-ink-line bg-surface p-1" value={u.role} onChange={(e) => { const role = e.target.value; if (window.confirm(`${u.nickname} 역할을 ${role} 로 바꿀까요?`)) run(async () => { await api(`/admin/users/${u.id}/role`, { method: 'PATCH', json: { role } }); return `역할 변경: ${role}`; }); }}>
                    {['USER', 'OPERATOR', 'SUPER_ADMIN'].map((r) => <option key={r}>{r}</option>)}</select>
                  <button className="btn-ghost px-3 py-1.5" onClick={() => { const a = window.prompt('지급(+) 또는 차감(-) 포인트'); const r = a && ask('포인트 조정'); if (a && r) run(async () => { const res = await api<{ balanceAfter: number }>(`/admin/users/${u.id}/points`, { method: 'POST', json: { amount: Number(a), reason: r, idempotencyKey: `ui-${u.id}-${Date.now()}` } }); return `조정 완료 · 잔액 ${pts(res.balanceAfter)}`; }); }}>포인트</button>
                  <button className="btn-ghost px-3 py-1.5" onClick={() => { const r = ask('2단계 인증 초기화'); if (r) run(async () => { await api(`/admin/users/${u.id}/mfa/reset`, { method: 'POST', json: { reason: r } }); return 'MFA 초기화'; }); }}>MFA 초기화</button>
                </>}
              </div>
            )}
          </li>
        ))}</ul>
      )}
    </AdminShell>
  );
}
