'use client';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { Badge, Spinner } from '@/components/ui';
import { AdminError, AdminShell, fmtDate } from '@/components/admin';

interface Row { id: string; provider: string; companyName: string; title: string; workLocation: string; status: 'ACTIVE' | 'ARCHIVED'; expiresAt: string | null; isDemo: boolean }
const EMPTY = { companyName: '', title: '', description: '', workLocation: '', employmentType: '정규직', experience: 'ANY', requiredCerts: '', preferredCerts: '', categories: '', salary: '', expiresAt: '', originalUrl: '' };
const split = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

export default function AdminJobs() {
  const rows = useApi<Row[]>('/admin/jobs');
  const providers = useApi<{ id: string; name: string; status: string; note?: string }[]>('/admin/jobs/providers');
  const [f, setF] = useState(EMPTY); const [mapCert, setMapCert] = useState(''); const [mapKw, setMapKw] = useState('');
  const [err, setErr] = useState<{ code?: string; message: string } | null>(null); const [ok, setOk] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, done: string) => { setErr(null); setOk(null); try { await fn(); setOk(done); rows.reload(); } catch (e) { setErr(e instanceof ApiError ? e : { message: '처리하지 못했어요.' }); } };
  const create = () => run(() => api('/admin/jobs', { method: 'POST', json: { ...f, requiredCerts: split(f.requiredCerts), preferredCerts: split(f.preferredCerts), categories: split(f.categories), salary: f.salary || undefined, expiresAt: f.expiresAt ? `${f.expiresAt}T23:59:59+09:00` : undefined } }).then(() => setF(EMPTY)), '공고를 등록했어요.');
  const field = (k: keyof typeof EMPTY, label: string, ph = '') => (
    <label className="text-xs font-semibold text-ink-soft">{label}<input className="input mt-1" value={f[k]} placeholder={ph} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
  );
  return (
    <AdminShell title="취업 공고">
      <ul className="flex flex-wrap gap-2 text-xs">{providers.data?.map((p) => <li key={p.id} className="card px-3 py-2"><span className="font-semibold">{p.name}</span> <Badge tone={p.status === 'ACTIVE' ? 'clear' : 'mute'}>{p.status}</Badge>{p.note && <p className="mt-1 text-ink-mute">{p.note}</p>}</li>)}</ul>
      <section className="card space-y-2 p-5" aria-labelledby="new-job">
        <h2 id="new-job" className="text-sm font-bold">운영 공고 등록</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {field('companyName', '회사명')}{field('title', '공고 제목')}{field('workLocation', '근무지', '경기 화성')}
          <label className="text-xs font-semibold text-ink-soft">고용 형태<select className="input mt-1" value={f.employmentType} onChange={(e) => setF({ ...f, employmentType: e.target.value })}>{['정규직', '계약직', '파트타임', '인턴'].map((x) => <option key={x}>{x}</option>)}</select></label>
          <label className="text-xs font-semibold text-ink-soft">경력<select className="input mt-1" value={f.experience} onChange={(e) => setF({ ...f, experience: e.target.value })}><option value="ANY">무관</option><option value="NEW">신입</option><option value="EXP">경력</option></select></label>
          {field('salary', '급여 (선택)')}{field('requiredCerts', '필수 자격증 ID (쉼표)', 'electric')}{field('preferredCerts', '우대 자격증 ID (쉼표)')}{field('categories', '직무 키워드 (쉼표)', '전기안전관리')}
          <label className="text-xs font-semibold text-ink-soft">마감일<input type="date" className="input mt-1" value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} /></label>
          {field('originalUrl', '원문 공고 링크 (https 필수)', 'https://')}
        </div>
        <label className="block text-xs font-semibold text-ink-soft">상세 설명<textarea rows={4} className="input mt-1" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <button className="btn-primary" onClick={create}>등록</button>
      </section>
      <section className="card space-y-2 p-5" aria-labelledby="jmap">
        <h2 id="jmap" className="text-sm font-bold">자격증 → 직무 키워드 수정</h2>
        <div className="flex flex-wrap gap-2"><input className="input max-w-[10rem]" aria-label="자격증 ID" placeholder="자격증 ID" value={mapCert} onChange={(e) => setMapCert(e.target.value)} /><input className="input flex-1" aria-label="키워드" placeholder="키워드 (쉼표, 비우면 기본값 복원)" value={mapKw} onChange={(e) => setMapKw(e.target.value)} />
          <button className="btn-ghost border border-ink-line" disabled={!mapCert} onClick={() => run(() => api(`/admin/job-map/${mapCert}`, { method: 'PUT', json: { keywords: mapKw.trim() ? split(mapKw) : null } }), '키워드를 저장했어요.')}>저장</button></div>
      </section>
      {ok && <p role="status" className="text-sm text-clear-deep">{ok}</p>}
      {err && <AdminError code={err.code} message={err.message} />}
      {rows.loading ? <Spinner /> : rows.error ? <AdminError code={rows.error.code} message={rows.error.message} /> : (
        <div className="card overflow-x-auto"><table className="w-full text-left text-xs">
          <thead className="bg-paper text-ink-mute"><tr><th className="p-2">출처</th><th className="p-2">회사</th><th className="p-2">제목</th><th className="p-2">근무지</th><th className="p-2">마감</th><th className="p-2">상태</th><th /></tr></thead>
          <tbody>{rows.data!.map((r) => (
            <tr key={r.id} className="border-t border-ink-line/60"><td className="p-2"><Badge tone="mute">{r.provider}</Badge></td><td className="p-2">{r.companyName}</td><td className="p-2 font-semibold">{r.title}</td><td className="p-2">{r.workLocation}</td><td className="p-2">{fmtDate(r.expiresAt)}</td><td className="p-2">{r.status}</td>
              <td className="p-2"><button className="text-cobalt" onClick={() => run(() => api(`/admin/jobs/${r.id}`, { method: 'PATCH', json: { status: r.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE' } }), '상태를 바꿨어요.')}>{r.status === 'ACTIVE' ? '보관' : '복원'}</button></td></tr>
          ))}</tbody>
        </table></div>
      )}
    </AdminShell>
  );
}
