'use client';
import { useState } from 'react';
import { api, ApiError, pts } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { Badge, Chip, Spinner } from '@/components/ui';
import { AdminError, AdminShell, fmtDate } from '@/components/admin';

interface Row { id: string; referrer: string; referee: string; amount: number; status: 'PENDING' | 'REWARDED' | 'REJECTED'; reason: string | null; dupSuspect: boolean; dupReason: string | null; createdAt: string; checks: { key: string; label: string; ok: boolean }[] | null }

export default function AdminReferral() {
  const [status, setStatus] = useState<'PENDING' | 'REWARDED' | 'REJECTED' | ''>('PENDING');
  const rows = useApi<Row[]>(`/admin/referral/rewards${status ? `?status=${status}` : ''}`);
  const [err, setErr] = useState<{ code?: string; message: string } | null>(null); const [ok, setOk] = useState<string | null>(null);
  const run = async (fn: () => Promise<{ status?: string; reason?: string }>) => {
    setErr(null); setOk(null);
    try { const r = await fn(); setOk(r.status === 'REJECTED' && r.reason ? `재검증 실패로 거절했어요: ${r.reason}` : '처리했어요.'); rows.reload(); } catch (e) { setErr(e instanceof ApiError ? e : { message: '처리하지 못했어요.' }); }
  };
  const approve = (r: Row) => run(() => api(`/admin/referral/rewards/${r.id}/approve`, { method: 'POST', json: {} }));
  const override = (r: Row) => { const note = window.prompt('중복 의심을 해제하는 근거를 입력하세요 (예: 가족 확인)'); if (note) run(() => api(`/admin/referral/rewards/${r.id}/approve`, { method: 'POST', json: { overrideDup: true, note } })); };
  const reject = (r: Row) => { const reason = window.prompt('거절 사유'); if (reason) run(() => api(`/admin/referral/rewards/${r.id}/reject`, { method: 'POST', json: { reason } })); };
  return (
    <AdminShell title="친구 초대 보상">
      <p className="text-xs text-ink-mute">승인 시 9개 항목을 다시 확인하고, 하나라도 맞지 않으면 자동으로 거절돼요. 중복 의심만 걸린 건은 확인 근거를 남기고 해제할 수 있어요.</p>
      <div className="flex gap-1">{(['PENDING', 'REWARDED', 'REJECTED', ''] as const).map((s) => <Chip key={s} on={status === s} onClick={() => setStatus(s)}>{{ PENDING: '승인 대기', REWARDED: '지급', REJECTED: '거절', '': '전체' }[s]}</Chip>)}</div>
      {ok && <p role="status" className="text-sm text-clear-deep">{ok}</p>}
      {err && <AdminError code={err.code} message={err.message} />}
      {rows.loading ? <Spinner /> : rows.error ? <AdminError code={rows.error.code} message={rows.error.message} /> : (
        <div className="card overflow-x-auto"><table className="w-full text-left text-xs">
          <thead className="bg-paper text-ink-mute"><tr><th className="p-2">요청일</th><th className="p-2">추천인</th><th className="p-2">피추천인</th><th className="p-2">보상</th><th className="p-2">상태</th><th className="p-2">비고</th><th /></tr></thead>
          <tbody>{rows.data!.length === 0 ? <tr><td colSpan={7} className="p-6 text-center text-ink-mute">해당 건이 없어요.</td></tr> : rows.data!.map((r) => (
            <tr key={r.id} className="border-t border-ink-line/60">
              <td className="p-2">{fmtDate(r.createdAt)}</td><td className="p-2">{r.referrer}</td><td className="p-2">{r.referee}</td><td className="p-2">{pts(r.amount)}</td>
              <td className="p-2"><Badge tone={r.status === 'REWARDED' ? 'clear' : r.status === 'REJECTED' ? 'risk' : 'gold'}>{r.status}</Badge></td>
              <td className="p-2">{r.dupSuspect && <Badge tone="risk">중복 의심</Badge>} {r.dupReason ?? ''} {r.reason ?? ''}</td>
              <td className="whitespace-nowrap p-2">{r.status === 'PENDING' && <>{r.dupSuspect ? <button className="text-gold" onClick={() => override(r)}>확인 후 승인</button> : <button className="text-cobalt" onClick={() => approve(r)}>승인</button>} · <button className="text-risk" onClick={() => reject(r)}>거절</button></>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </AdminShell>
  );
}
