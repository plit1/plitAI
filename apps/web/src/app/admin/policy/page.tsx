'use client';
import { useEffect, useState } from 'react';
import { api, ApiError, pts, won } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/use-api';
import { Spinner } from '@/components/ui';
import { AdminError, AdminShell, fmtDateTime } from '@/components/admin';

interface Policy { version: string; values: Record<string, number | boolean | string[]>; features: string[]; history: { id: string; isCurrent: boolean; createdAt: string; createdBy: string | null }[] }
const NUM: [string, string, (n: number) => string][] = [
  ['passPrice', '부스터 패스 가격', won], ['togetherReward', '플릿런 합격 보상', pts], ['boosterReward', '부스터 합격 보상', pts],
  ['refundDays', '환불 가능 기간(일)', String], ['welcomePoints', '가입 축하 포인트', pts], ['referralReward', '친구 초대 보상', pts],
  ['openRunTarget', '오픈런 목표 인원', String], ['openRunDailyLimit', '오픈런 하루 요청 한도', String],
];

export default function PolicyPage() {
  const { me } = useAuth();
  const p = useApi<Policy>('/admin/policy');
  const [draft, setDraft] = useState<Record<string, number>>({}); const [free, setFree] = useState<string[]>([]);
  const [version, setVersion] = useState(''); const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (p.data) { setDraft(Object.fromEntries(NUM.map(([k]) => [k, Number(p.data!.values[k])]))); setFree(p.data.values.freeFeatures as string[]); } }, [p.data]);
  const isSuper = me?.role === 'SUPER_ADMIN';

  const publish = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setMsg(null);
    const changed = Object.fromEntries(Object.entries(draft).filter(([k, v]) => v !== Number(p.data!.values[k])));
    const freeChanged = JSON.stringify([...free].sort()) !== JSON.stringify([...(p.data!.values.freeFeatures as string[])].sort());
    if (!Object.keys(changed).length && !freeChanged) return setErr('바뀐 값이 없어요.');
    if (!window.confirm(`새 정책 ${version} 을 발행할까요? 기존 참여자 보상은 바뀌지 않아요.`)) return;
    try { await api('/admin/policy', { method: 'POST', json: { version, values: { ...changed, ...(freeChanged ? { freeFeatures: free } : {}) } } }); setMsg(`정책 ${version} 발행 완료`); setVersion(''); p.reload(); }
    catch (e2) { setErr(e2 instanceof ApiError ? e2.message : '발행하지 못했어요.'); }
  };

  return (
    <AdminShell title="상품·보상 정책">
      {p.loading ? <Spinner /> : p.error ? <AdminError code={p.error.code} message={p.error.message} /> : (
        <form onSubmit={publish} className="space-y-4">
          <p className="text-sm text-ink-soft">현재 버전 <b className="font-mono">{p.data!.version}</b> · 변경은 새 버전으로 발행되며 이후 신규 참여부터 적용돼요.</p>
          <div className="card grid gap-3 p-5 sm:grid-cols-2">
            {NUM.map(([k, label, f]) => (
              <div key={k}><label htmlFor={k} className="label">{label} <span className="font-normal text-ink-mute">현재 {f(Number(p.data!.values[k]))}</span></label>
                <input id={k} type="number" min={0} step={1} className="input" disabled={!isSuper} value={draft[k] ?? ''} onChange={(e) => setDraft({ ...draft, [k]: Number(e.target.value) })} /></div>
            ))}
          </div>
          <fieldset className="card p-5"><legend className="px-1 text-sm font-bold">플릿런(무료)에서 허용할 기능</legend>
            <div className="mt-2 grid gap-1 sm:grid-cols-2">{p.data!.features.map((f) => (
              <label key={f} className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!isSuper} checked={free.includes(f)} onChange={(e) => setFree(e.target.checked ? [...free, f] : free.filter((x) => x !== f))} /><span className="font-mono text-xs">{f}</span></label>
            ))}</div>
          </fieldset>
          {isSuper ? (
            <div className="card flex flex-wrap items-end gap-2 p-5">
              <div className="grow"><label htmlFor="ver" className="label">새 정책 버전 (예: 2026-12-v2.3)</label><input id="ver" required pattern="\d{4}-\d{2}-v[0-9.]+" className="input font-mono" value={version} onChange={(e) => setVersion(e.target.value)} /></div>
              <button className="btn-primary">정책 발행</button>
            </div>
          ) : <p className="text-xs text-ink-mute">정책 변경은 최고 관리자만 할 수 있어요.</p>}
          {err && <p role="alert" className="text-sm text-risk">{err}</p>}{msg && <p role="status" className="text-sm text-clear-deep">{msg}</p>}
          <section className="card p-5"><h2 className="text-sm font-bold">발행 이력</h2>
            <ul className="mt-2 space-y-1 text-xs">{p.data!.history.map((h) => <li key={h.id} className="flex justify-between"><span className="font-mono">{h.id}{h.isCurrent && ' (현재)'}</span><span className="text-ink-mute">{fmtDateTime(h.createdAt)}</span></li>)}</ul>
          </section>
        </form>
      )}
    </AdminShell>
  );
}
