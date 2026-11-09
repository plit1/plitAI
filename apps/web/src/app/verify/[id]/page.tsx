'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { Badge, Spinner } from '@/components/ui';

const LABEL: Record<string, string> = { none: '미제출', REVIEWING: '검토 중', NEEDS_FIX: '보완 필요', APPROVED: '합격 승인', FAILED: '불합격 확인', REJECTED: '반려' };

export default function Verify() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, reload } = useApi<{ status: string; note?: string | null; examNumber?: string }>(`/enrollments/${id}/verification`);
  const [examNumber, setExamNumber] = useState(''); const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!file) return setMsg('성적 확인서 파일을 선택해주세요.');
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const up = await api<{ key: string }>('/uploads/evidence', { method: 'POST', body: fd });
      const r = await api<{ message: string }>(`/enrollments/${id}/verification`, { method: 'POST', json: { examNumber, evidenceKey: up.key } });
      setMsg(r.message); reload();
    } catch (err) { setMsg(err instanceof ApiError ? err.message : '제출하지 못했어요.'); } finally { setBusy(false); }
  };
  if (loading) return <Spinner />;
  const canSubmit = !data || ['none', 'NEEDS_FIX', 'REJECTED'].includes(data.status);
  return (
    <section className="card mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-xl font-black">합격 인증</h1>
      <p className="text-sm">현재 상태 <Badge tone="gold">{LABEL[data?.status ?? 'none']}</Badge></p>
      {data?.note && <p className="rounded-xl bg-gold-tint p-3 text-sm text-gold">{data.note}</p>}
      {canSubmit && (
        <form onSubmit={submit} className="space-y-3">
          <div><label htmlFor="no" className="label">수험번호</label><input id="no" className="input" value={examNumber} onChange={(e) => setExamNumber(e.target.value)} required /></div>
          <div><label htmlFor="f" className="label">성적 확인서 (JPG·PNG·PDF, 10MB 이하)</label><input id="f" type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" /></div>
          <p className="text-[11px] text-ink-mute">수험번호는 뒤 4자리만 저장되며, 증빙은 심사 목적으로만 사용돼요.</p>
          <button className="btn-primary w-full" disabled={busy}>{busy ? '제출 중…' : '결과 제출'}</button>
        </form>
      )}
      {msg && <p role="status" className="text-sm text-ink-soft">{msg}</p>}
    </section>
  );
}
