'use client';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { Badge, Spinner } from '@/components/ui';
import { AdminError, AdminShell } from '@/components/admin';

interface QItem { id: string; certId: string; subject: string; prompt: string; options: string[]; answer: number; source: string; isSample: boolean; status: 'DRAFT' | 'PUBLISHED' | 'RETIRED' }
const TONE = { DRAFT: 'mute', PUBLISHED: 'clear', RETIRED: 'risk' } as const;

export default function QuizItems() {
  const certs = useApi<{ items: { id: string; name: string; subjects: string[] }[] }>('/certifications?sort=name');
  const [certId, setCertId] = useState('industrial-safety');
  const items = useApi<QItem[]>(`/admin/quiz-items?certId=${certId}`);
  const cert = certs.data?.items.find((c) => c.id === certId);
  const [f, setF] = useState({ subject: '', prompt: '', options: ['', '', '', ''], answer: 0, source: '' });
  const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<{ code?: string; message: string } | null>(null);
  const run = async (fn: () => Promise<unknown>, ok: string) => { setErr(null); setMsg(null); try { await fn(); setMsg(ok); items.reload(); } catch (e) { setErr(e instanceof ApiError ? e : { message: '처리하지 못했어요.' }); } };
  return (
    <AdminShell title="QUICK TEST 문항">
      <div><label htmlFor="qc" className="label">자격증</label><select id="qc" className="input max-w-xs" value={certId} onChange={(e) => setCertId(e.target.value)}>{certs.data?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <p className="text-xs text-ink-mute">출처(저작권)를 확인한 문항만 공개할 수 있어요. 공식 기출을 그대로 옮길 때는 시행기관 이용 조건을 확인하세요.</p>
      <form className="card grid gap-2 p-4" onSubmit={(e) => { e.preventDefault(); run(() => api('/admin/quiz-items', { method: 'POST', json: { certId, ...f, options: f.options.filter((o) => o.trim()) } }), '초안으로 저장했어요.'); }}>
        <div className="grid gap-2 sm:grid-cols-2">
          <div><label htmlFor="qs" className="label">과목</label><select id="qs" className="input" required value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })}><option value="">선택</option>{cert?.subjects.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div><label htmlFor="qsrc" className="label">출처</label><input id="qsrc" className="input" required placeholder="자체 제작 등" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} /></div>
        </div>
        <div><label htmlFor="qp" className="label">문제</label><textarea id="qp" rows={2} className="input" required value={f.prompt} onChange={(e) => setF({ ...f, prompt: e.target.value })} /></div>
        <fieldset className="grid gap-1 sm:grid-cols-2"><legend className="label">보기 (정답 선택)</legend>{f.options.map((o, i) => (
          <label key={i} className="flex items-center gap-2"><input type="radio" name="ans" checked={f.answer === i} onChange={() => setF({ ...f, answer: i })} aria-label={`${i + 1}번 정답`} /><input className="input" placeholder={`${i + 1}번`} value={o} onChange={(e) => setF({ ...f, options: f.options.map((x, j) => (j === i ? e.target.value : x)) })} /></label>
        ))}</fieldset>
        <button className="btn-primary">문항 추가 (초안)</button>
      </form>
      {msg && <p role="status" className="text-sm text-clear-deep">{msg}</p>}{err && <AdminError code={err.code} message={err.message} />}
      {items.loading ? <Spinner /> : items.error ? <AdminError code={items.error.code} message={items.error.message} /> : (
        <ul className="space-y-2">{items.data!.map((q) => (
          <li key={q.id} className="card p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p><Badge tone={TONE[q.status]}>{q.status}</Badge> <Badge tone="mute">{q.subject}</Badge> {q.isSample && <Badge tone="gold">예시 문항</Badge>}</p>
              <div className="flex gap-1 text-xs">
                {q.status !== 'PUBLISHED' && <button className="btn-primary px-3 py-1.5" onClick={() => run(() => api(`/admin/quiz-items/${q.id}`, { method: 'PATCH', json: { status: 'PUBLISHED' } }), '공개했어요.')}>공개</button>}
                {q.status === 'PUBLISHED' && <button className="btn-ghost px-3 py-1.5" onClick={() => run(() => api(`/admin/quiz-items/${q.id}`, { method: 'PATCH', json: { status: 'RETIRED' } }), '출제 중지했어요.')}>출제 중지</button>}
              </div>
            </div>
            <p className="mt-1 font-semibold">{q.prompt}</p>
            <ol className="mt-1 list-decimal pl-5 text-xs text-ink-soft">{q.options.map((o, i) => <li key={i} className={i === q.answer ? 'font-bold text-clear-deep' : ''}>{o}</li>)}</ol>
            <p className="mt-1 text-[11px] text-ink-mute">출처: {q.source || '(미입력)'}</p>
          </li>
        ))}</ul>
      )}
    </AdminShell>
  );
}
