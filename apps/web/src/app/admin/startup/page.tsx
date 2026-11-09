'use client';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { Badge, Chip, Spinner } from '@/components/ui';
import { AdminError, AdminShell, fmtDate } from '@/components/admin';
import type { Meta } from '@/components/startup';

interface Row { id: string; provider: string; title: string; agency: string; region: string; supportType: string; applyEnd: string | null; status: 'ACTIVE' | 'HIDDEN'; isDemo: boolean }
interface MapRow { certId: string; name: string; industry: string; reason: string; overridden: boolean }
const EMPTY = { title: '', agency: '', region: '전국', sigungu: '', targetStages: ['PREP'] as string[], industries: ['ALL'] as string[], supportType: 'GRANT', applyStart: '', applyEnd: '', eligibility: '', summary: '', sourceUrl: '' };
const tog = (a: string[], v: string) => (a.includes(v) ? a.filter((x) => x !== v) : [...a, v]);

export default function AdminStartup() {
  const meta = useApi<Meta>('/startup/meta');
  const rows = useApi<Row[]>('/admin/startup/programs');
  const maps = useApi<MapRow[]>('/admin/startup/industry-map');
  const providers = useApi<{ id: string; name: string; status: string; note?: string }[]>('/admin/startup/providers');
  const [f, setF] = useState(EMPTY); const [err, setErr] = useState<{ code?: string; message: string } | null>(null); const [ok, setOk] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, done: string) => { setErr(null); setOk(null); try { await fn(); setOk(done); rows.reload(); maps.reload(); } catch (e) { setErr(e instanceof ApiError ? e : { message: '처리하지 못했어요.' }); } };
  if (meta.loading || !meta.data) return <AdminShell title="창업 지원사업"><Spinner /></AdminShell>;
  const m = meta.data;
  const kst = (d: string, end: boolean) => (d ? `${d}T${end ? '23:59:59' : '00:00:00'}+09:00` : undefined);
  const create = () => run(() => api('/admin/startup/programs', { method: 'POST', json: { ...f, sigungu: f.sigungu || undefined, applyStart: kst(f.applyStart, false), applyEnd: kst(f.applyEnd, true) } }).then(() => setF(EMPTY)), '지원사업을 등록했어요.');
  const txt = (k: 'title' | 'agency' | 'sigungu' | 'sourceUrl', label: string, ph = '') => <label className="text-xs font-semibold text-ink-soft">{label}<input className="input mt-1" placeholder={ph} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>;
  return (
    <AdminShell title="창업 지원사업">
      <ul className="flex flex-wrap gap-2 text-xs">{providers.data?.map((p) => <li key={p.id} className="card px-3 py-2"><span className="font-semibold">{p.name}</span> <Badge tone={p.status === 'ACTIVE' ? 'clear' : 'mute'}>{p.status}</Badge>{p.note && <p className="mt-1 text-ink-mute">{p.note}</p>}</li>)}</ul>
      <section className="card space-y-2 p-5" aria-labelledby="new-prog">
        <h2 id="new-prog" className="text-sm font-bold">운영 공고 등록</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {txt('title', '사업명')}{txt('agency', '기관')}
          <label className="text-xs font-semibold text-ink-soft">지역<select className="input mt-1" value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })}><option>전국</option>{m.sido.map((s) => <option key={s}>{s}</option>)}</select></label>
          {txt('sigungu', '시·군·구 (선택)')}
          <label className="text-xs font-semibold text-ink-soft">지원 유형<select className="input mt-1" value={f.supportType} onChange={(e) => setF({ ...f, supportType: e.target.value })}>{Object.entries(m.supportTypes).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
          {txt('sourceUrl', '원문 공고 링크 (https 필수)', 'https://')}
          <label className="text-xs font-semibold text-ink-soft">접수 시작<input type="date" className="input mt-1" value={f.applyStart} onChange={(e) => setF({ ...f, applyStart: e.target.value })} /></label>
          <label className="text-xs font-semibold text-ink-soft">접수 마감<input type="date" className="input mt-1" value={f.applyEnd} onChange={(e) => setF({ ...f, applyEnd: e.target.value })} /></label>
        </div>
        <fieldset><legend className="text-xs font-semibold text-ink-soft">대상 단계</legend><div className="mt-1 flex flex-wrap gap-1">{Object.entries(m.stages).map(([k, v]) => <Chip key={k} on={f.targetStages.includes(k)} onClick={() => setF({ ...f, targetStages: tog(f.targetStages, k) })}>{v.label}</Chip>)}</div></fieldset>
        <fieldset><legend className="text-xs font-semibold text-ink-soft">대상 업종</legend><div className="mt-1 flex flex-wrap gap-1"><Chip on={f.industries.includes('ALL')} onClick={() => setF({ ...f, industries: ['ALL'] })}>전 업종</Chip>{m.industries.map((i) => <Chip key={i.code} on={f.industries.includes(i.code)} onClick={() => setF({ ...f, industries: tog(f.industries.filter((x) => x !== 'ALL'), i.code) })}>{i.name}</Chip>)}</div></fieldset>
        <label className="block text-xs font-semibold text-ink-soft">신청 자격<textarea rows={2} className="input mt-1" value={f.eligibility} onChange={(e) => setF({ ...f, eligibility: e.target.value })} /></label>
        <label className="block text-xs font-semibold text-ink-soft">요약<textarea rows={3} className="input mt-1" value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></label>
        <button className="btn-primary" onClick={create}>등록</button>
      </section>
      <section className="card space-y-2 p-5" aria-labelledby="imap">
        <h2 id="imap" className="text-sm font-bold">자격증 → 업종 매핑</h2>
        <ul className="space-y-1 text-sm">{maps.data?.map((r) => (
          <li key={r.certId} className="flex flex-wrap items-center gap-2">
            <span className="w-40 font-semibold">{r.name}</span>
            <select aria-label={`${r.name} 업종`} className="rounded-lg border border-ink-line bg-surface px-2 py-1 text-xs" value={r.industry} onChange={(e) => run(() => api(`/admin/startup/industry-map/${r.certId}`, { method: 'PUT', json: { industry: e.target.value, reason: '관리자 지정' } }), '매핑을 저장했어요.')}>{m.industries.map((i) => <option key={i.code} value={i.code}>{i.name}</option>)}</select>
            {r.overridden ? <button className="text-xs text-ink-mute underline" onClick={() => run(() => api(`/admin/startup/industry-map/${r.certId}`, { method: 'PUT', json: { industry: null } }), '기본값으로 되돌렸어요.')}>기본값 복원</button> : <Badge tone="mute">기본값</Badge>}
            <span className="text-xs text-ink-mute">{r.reason}</span>
          </li>
        ))}</ul>
      </section>
      {ok && <p role="status" className="text-sm text-clear-deep">{ok}</p>}
      {err && <AdminError code={err.code} message={err.message} />}
      {rows.loading ? <Spinner /> : rows.error ? <AdminError code={rows.error.code} message={rows.error.message} /> : (
        <div className="card overflow-x-auto"><table className="w-full text-left text-xs">
          <thead className="bg-paper text-ink-mute"><tr><th className="p-2">출처</th><th className="p-2">사업명</th><th className="p-2">기관</th><th className="p-2">지역</th><th className="p-2">마감</th><th className="p-2">상태</th><th /></tr></thead>
          <tbody>{rows.data!.map((r) => (
            <tr key={r.id} className="border-t border-ink-line/60"><td className="p-2"><Badge tone="mute">{r.provider}</Badge></td><td className="p-2 font-semibold">{r.title}</td><td className="p-2">{r.agency}</td><td className="p-2">{r.region}</td><td className="p-2">{fmtDate(r.applyEnd)}</td><td className="p-2">{r.status}</td>
              <td className="p-2"><button className="text-cobalt" onClick={() => run(() => api(`/admin/startup/programs/${r.id}`, { method: 'PATCH', json: { status: r.status === 'ACTIVE' ? 'HIDDEN' : 'ACTIVE' } }), '상태를 바꿨어요.')}>{r.status === 'ACTIVE' ? '숨김' : '복원'}</button></td></tr>
          ))}</tbody>
        </table></div>
      )}
    </AdminShell>
  );
}
