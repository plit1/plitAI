'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/use-api';
import { Badge, ErrorBox, Spinner } from '@/components/ui';

interface Comment { id: string; authorId: string; author: string; body: string; deleted: boolean; mine: boolean; createdAt: string }
interface Post { id: string; category: string; title: string; body: string; author: string; authorId: string; mine: boolean; liked: boolean; likeCount: number; viewCount: number; certName: string | null; origin: string; createdAt: string; comments: Comment[] }

export default function PostPage() {
  const { id } = useParams<{ id: string }>(); const router = useRouter(); const { me } = useAuth();
  const p = useApi<Post>(`/community/posts/${id}`);
  const [c, setC] = useState(''); const [msg, setMsg] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, ok?: string) => { setMsg(null); try { await fn(); if (ok) setMsg(ok); p.reload(); } catch (e) { setMsg(e instanceof ApiError ? e.message : '처리하지 못했어요.'); } };
  const report = (targetType: 'POST' | 'COMMENT', targetId: string) => { const reason = window.prompt('신고 사유'); if (reason) run(() => api('/reports', { method: 'POST', json: { targetType, targetId, reason } }), '신고가 접수됐어요. 운영 검토 전까지 내 화면에서 가려져요.'); };

  if (p.loading) return <Spinner />;
  if (p.error) return <ErrorBox message={p.error.message} />;
  const d = p.data!;
  return (
    <article className="mx-auto max-w-2xl space-y-4">
      <Link href="/community" className="text-sm text-ink-mute">← 커뮤니티</Link>
      <header className="card p-5">
        <div className="flex flex-wrap gap-1"><Badge tone="mute">{d.category}</Badge>{d.certName && <Badge>{d.certName}</Badge>}{d.origin === 'STUDY_ROOM' && <Badge tone="clear">스터디룸 작성</Badge>}</div>
        <h1 className="mt-2 text-xl font-black">{d.title}</h1>
        <p className="text-xs text-ink-mute">{d.author} · {new Date(d.createdAt).toLocaleString('ko-KR')} · 조회 {d.viewCount}</p>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">{d.body}</p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          {me && <button className={d.liked ? 'btn-primary px-3 py-2' : 'btn-ghost border border-ink-line px-3 py-2'} aria-pressed={d.liked} onClick={() => run(() => api(`/community/posts/${id}/like`, { method: d.liked ? 'DELETE' : 'PUT' }))}>좋아요 {d.likeCount}</button>}
          {me && !d.mine && <button className="btn-ghost px-3 py-2" onClick={() => report('POST', d.id)}>신고</button>}
          {me && !d.mine && <button className="btn-ghost px-3 py-2" onClick={() => { if (window.confirm(`${d.author}님을 차단할까요? 차단한 사람의 글과 댓글이 보이지 않아요.`)) run(async () => { await api(`/me/blocks/${d.authorId}`, { method: 'PUT' }); router.push('/community'); }); }}>작성자 차단</button>}
          {d.mine && <button className="btn-ghost px-3 py-2 text-risk" onClick={() => { if (window.confirm('글을 삭제할까요?')) run(async () => { await api(`/community/posts/${id}`, { method: 'DELETE' }); router.push('/community'); }); }}>삭제</button>}
        </div>
        {msg && <p role="status" className="mt-2 text-xs text-ink-soft">{msg}</p>}
      </header>
      <section className="card p-5" aria-label="댓글">
        <h2 className="text-sm font-bold">댓글 {d.comments.filter((x) => !x.deleted).length}</h2>
        <ul className="mt-2 space-y-2">{d.comments.map((x) => (
          <li key={x.id} className="rounded-xl bg-paper p-3 text-sm">
            {x.deleted ? <span className="text-ink-mute">삭제된 댓글이에요.</span> : (<>
              <p className="text-xs font-semibold text-ink-soft">{x.author}</p><p className="whitespace-pre-wrap">{x.body}</p>
              <div className="mt-1 flex gap-2 text-[11px] text-ink-mute">
                {x.mine && <button onClick={() => run(() => api(`/community/comments/${x.id}`, { method: 'DELETE' }))}>삭제</button>}
                {me && !x.mine && <button onClick={() => report('COMMENT', x.id)}>신고</button>}
              </div></>)}
          </li>
        ))}</ul>
        {me ? (
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await api(`/community/posts/${id}/comments`, { method: 'POST', json: { body: c } }); setC(''); }); }}>
            <label htmlFor="cm" className="sr-only">댓글 입력</label><input id="cm" className="input" maxLength={500} placeholder="댓글을 남겨주세요" value={c} onChange={(e) => setC(e.target.value)} /><button className="btn-primary shrink-0" disabled={!c.trim()}>등록</button>
          </form>
        ) : <p className="mt-3 text-xs text-ink-mute"><Link className="text-cobalt" href={`/login?next=/community/${id}`}>로그인</Link> 후 댓글을 남길 수 있어요.</p>}
      </section>
    </article>
  );
}
