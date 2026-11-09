'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function Write() {
  const { me, ready } = useAuth(); const router = useRouter();
  useEffect(() => { if (ready && !me) router.replace('/login?next=/community/write'); }, [ready, me, router]);
  const [f, setF] = useState({ category: '질문', title: '', body: '' }); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const r = await api<{ id: string }>('/community/posts', { method: 'POST', json: f }); router.push(`/community/${r.id}`); }
    catch (e2) { setErr(e2 instanceof ApiError ? e2.message : '작성하지 못했어요.'); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="card mx-auto max-w-2xl space-y-3 p-6">
      <h1 className="text-xl font-black">글쓰기</h1>
      <div><label htmlFor="wc" className="label">카테고리</label><select id="wc" className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{['질문', '응원', '학습 기록', '합격 후기'].map((c) => <option key={c}>{c}</option>)}</select></div>
      <div><label htmlFor="wt" className="label">제목 (2~60자)</label><input id="wt" className="input" maxLength={60} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
      <div><label htmlFor="wb" className="label">내용 (5~2,000자)</label><textarea id="wb" rows={8} className="input" maxLength={2000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
      <p className="text-[11px] text-ink-mute">전화번호·이메일·메신저 ID·외부 링크는 올릴 수 없어요.</p>
      {err && <p role="alert" className="text-sm text-risk">{err}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? '올리는 중…' : '올리기'}</button>
    </form>
  );
}
