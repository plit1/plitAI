'use client';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { Badge, Spinner } from '@/components/ui';
import { AdminError, AdminShell, fmtDateTime } from '@/components/admin';

interface Report { id: string; targetType: 'POST' | 'COMMENT' | 'CHAT'; targetId: string; excerpt: string; reason: string; roomId: string | null; status: string; createdAt: string }
const LABEL = { POST: '게시글', COMMENT: '댓글', CHAT: '채팅' };

export default function Reports() {
  const [status, setStatus] = useState('PENDING');
  const list = useApi<Report[]>(`/admin/reports?status=${status}`);
  const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<{ code?: string; message: string } | null>(null);
  const act = async (r: Report, action: 'hide' | 'restore' | 'dismiss') => {
    setErr(null); setMsg(null);
    try { const res = await api<{ reportsHandled: number }>(`/admin/reports/${r.id}/moderate`, { method: 'POST', json: { action } }); setMsg(`${LABEL[r.targetType]} ${action === 'hide' ? '숨김' : action === 'restore' ? '복구' : '문제 없음'} · 신고 ${res.reportsHandled}건 처리`); list.reload(); }
    catch (e) { setErr(e instanceof ApiError ? e : { message: '처리하지 못했어요.' }); }
  };
  return (
    <AdminShell title="신고 처리">
      <div className="flex gap-1" role="group" aria-label="상태">{[['PENDING', '대기'], ['HIDDEN', '숨김'], ['DISMISSED', '종결']].map(([k, l]) => <button key={k} aria-pressed={status === k} onClick={() => setStatus(k)} className={`rounded-full px-3 py-1 text-xs ${status === k ? 'bg-ink text-white' : 'border border-ink-line text-ink-soft'}`}>{l}</button>)}</div>
      {msg && <p role="status" className="text-sm text-clear-deep">{msg}</p>}{err && <AdminError code={err.code} message={err.message} />}
      {list.loading ? <Spinner /> : list.error ? <AdminError code={list.error.code} message={list.error.message} /> : list.data!.length === 0 ? <p className="card p-6 text-center text-sm text-ink-mute">신고가 없어요.</p> : (
        <ul className="space-y-2">{list.data!.map((r) => (
          <li key={r.id} className="card flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
            <div><p><Badge tone="mute">{LABEL[r.targetType]}</Badge> {r.roomId && <Badge>스터디룸 {r.roomId}</Badge>} <span className="font-semibold">“{r.excerpt}”</span></p><p className="text-xs text-ink-mute">사유: {r.reason} · {fmtDateTime(r.createdAt)}</p></div>
            <div className="flex gap-1">
              {r.status === 'PENDING' && <><button className="btn-primary px-3 py-2" onClick={() => act(r, 'hide')}>숨김</button><button className="btn-ghost px-3 py-2" onClick={() => act(r, 'dismiss')}>문제 없음</button></>}
              {r.status === 'HIDDEN' && <button className="btn-ghost px-3 py-2" onClick={() => act(r, 'restore')}>복구</button>}
            </div>
          </li>
        ))}</ul>
      )}
    </AdminShell>
  );
}
