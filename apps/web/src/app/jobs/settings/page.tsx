'use client';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { useRequireLogin } from '@/lib/use-login';
import { Badge, Chip, ErrorBox, Spinner } from '@/components/ui';
import { JobsNav } from '@/components/jobs';

interface Profile {
  regions: string[]; roles: string[]; experience: string | null; employment: string[];
  certs: { certId: string; name: string; status: 'VERIFIED' | 'CLAIMED' | 'PREPARING' }[];
  options: { regions: string[]; employment: string[]; experience: Record<string, string> };
}
const STATUS = { VERIFIED: ['합격 인증', 'clear'], CLAIMED: ['보유(본인 입력)', 'cobalt'], PREPARING: ['준비 중', 'mute'] } as const;
const toggle = (a: string[], v: string) => (a.includes(v) ? a.filter((x) => x !== v) : [...a, v]);

export default function JobSettings() {
  const { ready } = useRequireLogin('/jobs/settings');
  const { data, error, loading, reload, setData } = useApi<Profile>(ready ? '/me/job-profile' : null);
  const certs = useApi<{ items: { id: string; name: string }[] } | { id: string; name: string }[]>(ready ? '/certifications' : null);
  const [f, setF] = useState<Pick<Profile, 'regions' | 'roles' | 'experience' | 'employment'> | null>(null);
  const [role, setRole] = useState(''); const [claim, setClaim] = useState(''); const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (data && !f) setF({ regions: data.regions, roles: data.roles, experience: data.experience, employment: data.employment }); }, [data, f]);
  if (!ready || loading || !f) return error ? <ErrorBox message={error.message} onRetry={reload} /> : <Spinner />;
  const list = certs.data ? (Array.isArray(certs.data) ? certs.data : certs.data.items) : [];
  const save = async () => {
    setMsg(null);
    try { const r = await api<Profile>('/me/job-profile', { method: 'PUT', json: f }); setData(r); setMsg('저장했어요. 맞춤 공고에 바로 반영돼요.'); } catch (e) { setMsg(e instanceof ApiError ? e.message : '잠시 후 다시 시도해주세요.'); }
  };
  const setClaimed = async (certId: string, on: boolean) => {
    try { const r = await api<Profile['certs']>(`/me/cert-claims/${certId}`, { method: on ? 'PUT' : 'DELETE' }); setData({ ...data!, certs: r }); setClaim(''); } catch (e) { setMsg(e instanceof ApiError ? e.message : '잠시 후 다시 시도해주세요.'); }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2"><h1 className="text-2xl font-black">맞춤 조건</h1><JobsNav /></div>
      <section className="card space-y-3 p-5" aria-labelledby="my-certs">
        <h2 id="my-certs" className="text-sm font-bold">내 자격증</h2>
        {data!.certs.length === 0 ? <p className="text-xs text-ink-mute">등록된 자격증이 없어요.</p> : (
          <ul className="space-y-1">{data!.certs.map((c) => (
            <li key={c.certId} className="flex items-center gap-2 text-sm"><Badge tone={STATUS[c.status][1]}>{STATUS[c.status][0]}</Badge>{c.name}
              {c.status === 'CLAIMED' && <button className="ml-auto text-xs text-ink-mute underline" onClick={() => setClaimed(c.certId, false)}>삭제</button>}</li>
          ))}</ul>
        )}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (claim) setClaimed(claim, true); }}>
          <select className="input" aria-label="보유 자격증 추가" value={claim} onChange={(e) => setClaim(e.target.value)}>
            <option value="">이미 가진 자격증 추가…</option>{list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="btn-primary shrink-0" type="submit" disabled={!claim}>추가</button>
        </form>
        <p className="text-xs text-ink-mute">본인 입력 자격증은 맞춤 추천에만 쓰이고 &lsquo;합격 인증&rsquo;으로 표시되지 않아요.</p>
      </section>
      <section className="card space-y-3 p-5" aria-labelledby="cond">
        <h2 id="cond" className="text-sm font-bold">희망 조건</h2>
        <fieldset><legend className="mb-1 text-xs font-semibold text-ink-soft">희망 지역</legend><div className="flex flex-wrap gap-1">{data!.options.regions.map((r) => <Chip key={r} on={f.regions.includes(r)} onClick={() => setF({ ...f, regions: toggle(f.regions, r) })}>{r}</Chip>)}</div></fieldset>
        <fieldset><legend className="mb-1 text-xs font-semibold text-ink-soft">고용 형태</legend><div className="flex flex-wrap gap-1">{data!.options.employment.map((r) => <Chip key={r} on={f.employment.includes(r)} onClick={() => setF({ ...f, employment: toggle(f.employment, r) })}>{r}</Chip>)}</div></fieldset>
        <fieldset><legend className="mb-1 text-xs font-semibold text-ink-soft">경력</legend><div className="flex flex-wrap gap-1"><Chip on={!f.experience} onClick={() => setF({ ...f, experience: null })}>상관없음</Chip>{Object.entries(data!.options.experience).map(([k, v]) => <Chip key={k} on={f.experience === k} onClick={() => setF({ ...f, experience: k })}>{v}</Chip>)}</div></fieldset>
        <fieldset><legend className="mb-1 text-xs font-semibold text-ink-soft">희망 직무 키워드</legend>
          <div className="flex flex-wrap gap-1">{f.roles.map((r) => <Chip key={r} on onClick={() => setF({ ...f, roles: f.roles.filter((x) => x !== r) })}>{r} ✕</Chip>)}</div>
          <div className="mt-2 flex gap-2"><input className="input" aria-label="직무 키워드" maxLength={20} value={role} onChange={(e) => setRole(e.target.value)} placeholder="예: 전기안전관리" />
            <button type="button" className="btn-ghost shrink-0 border border-ink-line" onClick={() => { if (role.trim() && f.roles.length < 10) { setF({ ...f, roles: [...new Set([...f.roles, role.trim()])] }); setRole(''); } }}>추가</button></div>
        </fieldset>
        <button className="btn-primary" onClick={save}>저장</button>
        {msg && <p role="status" className="text-sm text-ink-soft">{msg}</p>}
      </section>
    </div>
  );
}
