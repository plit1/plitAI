'use client';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { Badge, Spinner } from '@/components/ui';
import { AdminError, AdminShell, fmtDate } from '@/components/admin';

interface Round { id: string; certId: string; label: string; applyStart: string | null; applyEnd: string | null; examDate: string; resultDate: string | null; source: string; cert: { name: string } }
interface ImportResult { total: number; create: number; update: number; errors: { line: number; message: string }[]; applied: boolean }
const SAMPLE = 'certId,label,applyStart,applyEnd,examDate,resultDate\nindustrial-safety,2027년 1회,2027-01-10,2027-01-15,2027-02-20,2027-03-12';

export default function ExamRounds() {
  const rounds = useApi<Round[]>('/admin/exam-rounds');
  const providers = useApi<{ id: string; name: string; status: string; note?: string }[]>('/admin/exam-rounds/providers');
  const [csv, setCsv] = useState(''); const [result, setResult] = useState<ImportResult | null>(null);
  const [err, setErr] = useState<{ code?: string; message: string } | null>(null);
  const send = async (dryRun: boolean) => {
    setErr(null);
    try { const r = await api<ImportResult>('/admin/exam-rounds/import', { method: 'POST', json: { csv, dryRun } }); setResult(r); if (r.applied) rounds.reload(); }
    catch (e) { setErr(e instanceof ApiError ? e : { message: '처리하지 못했어요.' }); }
  };
  const del = async (r: Round) => { if (!window.confirm(`${r.cert.name} ${r.label} 일정을 삭제할까요?`)) return; try { await api(`/admin/exam-rounds/${r.id}`, { method: 'DELETE' }); rounds.reload(); } catch (e) { setErr(e instanceof ApiError ? e : { message: '삭제하지 못했어요.' }); } };

  return (
    <AdminShell title="공식 시험 일정">
      <ul className="flex flex-wrap gap-2 text-xs">{providers.data?.map((p) => (
        <li key={p.id} className="card px-3 py-2"><span className="font-semibold">{p.name}</span> <Badge tone={p.status === 'ACTIVE' ? 'clear' : 'mute'}>{p.status}</Badge>{p.note && <p className="mt-1 text-ink-mute">{p.note}</p>}</li>
      ))}</ul>
      <section className="card space-y-2 p-5" aria-labelledby="imp">
        <h2 id="imp" className="text-sm font-bold">CSV 일괄 등록</h2>
        <p className="text-xs text-ink-mute">날짜는 YYYY-MM-DD(한국 시간). 같은 자격증·회차명이면 수정돼요. 오류가 한 줄이라도 있으면 반영하지 않아요.</p>
        <label htmlFor="csv" className="sr-only">CSV 내용</label>
        <textarea id="csv" rows={6} className="input font-mono text-xs" placeholder={SAMPLE} value={csv} onChange={(e) => { setCsv(e.target.value); setResult(null); }} />
        <div className="flex flex-wrap gap-2">
          <input type="file" accept=".csv,text/csv" aria-label="CSV 파일 선택" className="text-xs" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setCsv(await f.text()); setResult(null); } }} />
          <button className="btn-ghost border border-ink-line" disabled={!csv} onClick={() => send(true)}>미리보기</button>
          <button className="btn-primary" disabled={!result || result.applied || result.errors.length > 0} onClick={() => send(false)}>반영</button>
        </div>
        {result && (
          <div role="status" className="rounded-xl bg-paper p-3 text-xs">
            <p>{result.applied ? '반영 완료' : '미리보기'} · 신규 {result.create} · 수정 {result.update} · 오류 {result.errors.length}</p>
            {result.errors.length > 0 && <ul className="mt-1 list-disc pl-4 text-risk">{result.errors.slice(0, 20).map((e) => <li key={e.line}>{e.line}행: {e.message}</li>)}</ul>}
          </div>
        )}
      </section>
      {err && <AdminError code={err.code} message={err.message} />}
      {rounds.loading ? <Spinner /> : rounds.error ? <AdminError code={rounds.error.code} message={rounds.error.message} /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-paper text-ink-mute"><tr><th className="p-2">자격증</th><th className="p-2">회차</th><th className="p-2">접수</th><th className="p-2">시험</th><th className="p-2">발표</th><th className="p-2">출처</th><th /></tr></thead>
            <tbody>{rounds.data!.length === 0 ? <tr><td colSpan={7} className="p-6 text-center text-ink-mute">등록된 일정이 없어요.</td></tr> : rounds.data!.map((r) => (
              <tr key={r.id} className="border-t border-ink-line/60"><td className="p-2 font-semibold">{r.cert.name}</td><td className="p-2">{r.label}</td><td className="p-2">{fmtDate(r.applyStart)} ~ {fmtDate(r.applyEnd)}</td><td className="p-2">{fmtDate(r.examDate)}</td><td className="p-2">{fmtDate(r.resultDate)}</td><td className="p-2"><Badge tone="mute">{r.source}</Badge></td><td className="p-2"><button className="text-risk" onClick={() => del(r)}>삭제</button></td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
