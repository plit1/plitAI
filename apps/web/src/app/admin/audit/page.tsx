'use client';
import { useState } from 'react';
import { useApi } from '@/lib/use-api';
import { Spinner } from '@/components/ui';
import { AdminError, AdminShell, fmtDateTime } from '@/components/admin';

interface Log { id: string; action: string; targetType: string; targetId: string; before: unknown; after: unknown; ip: string | null; createdAt: string; actor: { nickname: string; role: string } }

export default function Audit() {
  const [target, setTarget] = useState(''); const [applied, setApplied] = useState('');
  const list = useApi<Log[]>(`/admin/audit-logs${applied ? `?targetId=${encodeURIComponent(applied)}` : ''}`);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <AdminShell title="관리자 감사 로그">
      <form role="search" className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setApplied(target.trim()); }}>
        <label htmlFor="tid" className="sr-only">대상 ID</label><input id="tid" className="input font-mono" placeholder="대상 ID로 필터 (주문·회원·심사 ID)" value={target} onChange={(e) => setTarget(e.target.value)} /><button className="btn-primary shrink-0">조회</button>
      </form>
      {list.loading ? <Spinner /> : list.error ? <AdminError code={list.error.code} message={list.error.message} /> : (
        <ul className="card divide-y divide-ink-line/70 text-xs">{list.data!.map((l) => (
          <li key={l.id} className="p-3">
            <button className="flex w-full flex-wrap items-center justify-between gap-2 text-left" aria-expanded={open === l.id} onClick={() => setOpen(open === l.id ? null : l.id)}>
              <span><b>{l.action}</b> · {l.targetType} <span className="font-mono text-ink-mute">{l.targetId}</span></span>
              <span className="text-ink-mute">{l.actor.nickname}({l.actor.role}) · {fmtDateTime(l.createdAt)}</span>
            </button>
            {open === l.id && <pre className="mt-2 overflow-x-auto rounded-lg bg-paper p-2 text-[11px]">{JSON.stringify({ before: l.before, after: l.after, ip: l.ip }, null, 2)}</pre>}
          </li>
        ))}</ul>
      )}
    </AdminShell>
  );
}
