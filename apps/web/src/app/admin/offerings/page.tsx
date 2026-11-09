'use client';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { Badge, Spinner } from '@/components/ui';
import { AdminError, AdminShell, fmtDate } from '@/components/admin';

interface O { id: string; certId: string; certName: string; round: string; status: string; recruitEnd: string; examDate: string; free: { cap: number; joined: number }; premium: { cap: number; joined: number } }
const STATUSES = ['draft', 'open', 'closed', 'running', 'ended', 'cancelled'];

export default function Offerings() {
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const list = useApi<O[]>(`/challenges?status=${status}`);
  const certs = useApi<{ items: { id: string; name: string }[] }>('/certifications?sort=name');
  const [form, setForm] = useState({ id: '', certId: '', round: '', recruitEnd: '', examDate: '', durationDays: 56 });
  const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<{ code?: string; message: string } | null>(null);
  const run = async (fn: () => Promise<unknown>, ok: string) => { setErr(null); setMsg(null); try { await fn(); setMsg(ok); list.reload(); } catch (e) { setErr(e instanceof ApiError ? e : { message: '처리하지 못했어요.' }); } };
  const kst = (d: string) => new Date(`${d}T00:00:00+09:00`).toISOString();

  return (
    <AdminShell title="챌린지 회차 관리">
      <form className="card grid gap-3 p-5 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); run(() => api('/admin/offerings', { method: 'POST', json: { ...form, recruitEnd: kst(form.recruitEnd), examDate: kst(form.examDate) } }), `회차 ${form.id} 개설`); }}>
        <div><label htmlFor="cert" className="label">자격증</label><select id="cert" required className="input" value={form.certId} onChange={(e) => setForm({ ...form, certId: e.target.value, id: e.target.value ? `${e.target.value}-` : '' })}><option value="">선택</option>{certs.data?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><label htmlFor="oid" className="label">회차 ID (소문자·숫자·-)</label><input id="oid" required pattern="[a-z0-9-]{3,80}" className="input font-mono" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} /></div>
        <div><label htmlFor="round" className="label">회차명</label><input id="round" required className="input" placeholder="2027년 2회차" value={form.round} onChange={(e) => setForm({ ...form, round: e.target.value })} /></div>
        <div><label htmlFor="re" className="label">모집 마감일</label><input id="re" type="date" required className="input" value={form.recruitEnd} onChange={(e) => setForm({ ...form, recruitEnd: e.target.value })} /></div>
        <div><label htmlFor="ex" className="label">시험일</label><input id="ex" type="date" required className="input" value={form.examDate} onChange={(e) => setForm({ ...form, examDate: e.target.value })} /></div>
        <div><label htmlFor="du" className="label">기간(일)</label><input id="du" type="number" min={1} max={365} className="input" value={form.durationDays} onChange={(e) => setForm({ ...form, durationDays: Number(e.target.value) })} /></div>
        <button className="btn-primary sm:col-span-3">회차 개설</button>
      </form>
      {err && <AdminError code={err.code} message={err.message} />}{msg && <p role="status" className="text-sm text-clear-deep">{msg}</p>}
      <div className="flex gap-1" role="group" aria-label="상태">{(['open', 'closed'] as const).map((s) => <button key={s} aria-pressed={status === s} onClick={() => setStatus(s)} className={`rounded-full px-3 py-1 text-xs ${status === s ? 'bg-ink text-white' : 'text-ink-mute'}`}>{s === 'open' ? '모집 중' : '마감'}</button>)}</div>
      {list.loading ? <Spinner /> : list.error ? <AdminError message={list.error.message} /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-paper text-ink-mute"><tr><th className="p-2">회차</th><th className="p-2">모집 마감</th><th className="p-2">시험일</th><th className="p-2">플릿런</th><th className="p-2">부스터</th><th className="p-2">상태</th></tr></thead>
            <tbody>{list.data!.map((o) => (
              <tr key={o.id} className="border-t border-ink-line/60">
                <td className="p-2"><p className="font-semibold">{o.certName}</p><p className="font-mono text-ink-mute">{o.id}</p></td>
                <td className="p-2">{fmtDate(o.recruitEnd)}</td><td className="p-2">{fmtDate(o.examDate)}</td>
                <td className="p-2">{o.free.joined}/{o.free.cap}</td><td className="p-2">{o.premium.joined}/{o.premium.cap}</td>
                <td className="p-2"><label className="sr-only" htmlFor={`st-${o.id}`}>{o.id} 상태</label>
                  <select id={`st-${o.id}`} className="rounded border border-ink-line bg-surface p-1" value={o.status} onChange={(e) => { if (window.confirm(`${o.id} 상태를 ${e.target.value} 로 바꿀까요?`)) run(() => api(`/admin/offerings/${o.id}`, { method: 'PATCH', json: { status: e.target.value } }), '상태 변경'); }}>
                    {STATUSES.map((s) => <option key={s}>{s}</option>)}</select> {o.status === 'cancelled' && <Badge tone="risk">취소</Badge>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
