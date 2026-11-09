'use client';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { Badge, FIELD_LABEL, OR_STATUS, Spinner } from '@/components/ui';
import { AdminError, AdminShell, fmtDate } from '@/components/admin';

interface Req { id: string; title: string; category: string; round: string | null; reason: string | null; status: string; interestCount: number; targetCount: number; createdAt: string; requestedBy: { nickname: string } }
const NEXT: Record<string, [string, string][]> = {
  PENDING_REVIEW: [['APPROVE', '공개 승인'], ['REJECT', '반려']], COLLECTING: [['START_REVIEW', '개설 검토 시작'], ['REJECT', '반려']],
  THRESHOLD_REACHED: [['START_REVIEW', '개설 검토 시작'], ['OPEN', '회차 연결'], ['REJECT', '반려']], UNDER_REVIEW: [['OPEN', '회차 연결'], ['REJECT', '반려']],
};

export default function AdminOpenRun() {
  const [status, setStatus] = useState('');
  const list = useApi<Req[]>(`/admin/open-run${status ? `?status=${status}` : ''}`);
  const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<{ code?: string; message: string } | null>(null);
  const act = async (r: Req, action: string) => {
    const body: Record<string, string> = { action };
    if (action === 'REJECT') { const n = window.prompt('반려 사유 (요청자에게 보여요)'); if (!n) return; body.note = n; }
    if (action === 'OPEN') { const o = window.prompt('연결할 챌린지 회차 ID (먼저 회차를 개설하세요)'); if (!o) return; body.offeringId = o.trim(); }
    setErr(null); setMsg(null);
    try { const res = await api<{ status: string; notifyCount?: number }>(`/admin/open-run/${r.id}/review`, { method: 'POST', json: body }); setMsg(`${r.title}: ${OR_STATUS[res.status][0]}${res.notifyCount ? ` · 알림 대상 ${res.notifyCount}명` : ''}`); list.reload(); }
    catch (e) { setErr(e instanceof ApiError ? e : { message: '처리하지 못했어요.' }); }
  };
  return (
    <AdminShell title="오픈런 개설 요청">
      <div className="flex flex-wrap gap-1" role="group" aria-label="상태 필터">{[['', '전체'], ...Object.entries(OR_STATUS).map(([k, v]) => [k, v[0]])].map(([k, l]) => (
        <button key={k} aria-pressed={status === k} onClick={() => setStatus(k)} className={`rounded-full px-3 py-1 text-xs ${status === k ? 'bg-ink text-white' : 'border border-ink-line text-ink-soft'}`}>{l}</button>
      ))}</div>
      {msg && <p role="status" className="text-sm text-clear-deep">{msg}</p>}{err && <AdminError code={err.code} message={err.message} />}
      {list.loading ? <Spinner /> : list.error ? <AdminError code={list.error.code} message={list.error.message} /> : list.data!.length === 0 ? <p className="card p-6 text-center text-sm text-ink-mute">요청이 없어요.</p> : (
        <ul className="space-y-2">{list.data!.map((r) => (
          <li key={r.id} className="card flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <div>
              <p className="font-bold">{r.title} <Badge tone="mute">{FIELD_LABEL[r.category]}</Badge> <Badge tone={OR_STATUS[r.status][1]}>{OR_STATUS[r.status][0]}</Badge></p>
              <p className="text-xs text-ink-mute">관심 {r.interestCount}/{r.targetCount} · {r.requestedBy.nickname} · {fmtDate(r.createdAt)}{r.round && ` · ${r.round}`}</p>
              {r.reason && <p className="mt-1 text-xs text-ink-soft">{r.reason}</p>}
            </div>
            <div className="flex gap-1">{(NEXT[r.status] ?? []).map(([a, l]) => <button key={a} className={a === 'REJECT' ? 'btn-ghost px-3 py-2 text-risk' : 'btn-primary px-3 py-2'} onClick={() => act(r, a)}>{l}</button>)}</div>
          </li>
        ))}</ul>
      )}
    </AdminShell>
  );
}
