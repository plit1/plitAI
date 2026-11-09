'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/use-api';
import { Badge, ErrorBox, Spinner } from '@/components/ui';

interface Post { id: string; category: string; title: string; body: string; author: string; certName: string | null; origin: string; likeCount: number; commentCount: number; viewCount: number; createdAt: string }
const CATS = ['', '질문', '응원', '학습 기록', '합격 후기'];

export default function Community() {
  const { me } = useAuth();
  const [cat, setCat] = useState(''); const [q, setQ] = useState(''); const [applied, setApplied] = useState(''); const [sort, setSort] = useState<'recent' | 'popular'>('recent');
  const params = new URLSearchParams(Object.entries({ category: cat, q: applied, sort }).filter(([, v]) => v)).toString();
  const list = useApi<{ items: Post[]; nextCursor: string | null }>(`/community/posts?${params}`);
  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-2">
        <div><p className="font-display text-xs font-bold tracking-widest text-cobalt">COMMUNITY</p><h1 className="text-2xl font-black">커뮤니티</h1></div>
        {me ? <Link href="/community/write" className="btn-primary">글쓰기</Link> : <Link href="/login?next=/community/write" className="text-sm text-cobalt">로그인 후 글쓰기</Link>}
      </header>
      <form role="search" className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setApplied(q.trim()); }}>
        <label htmlFor="cq" className="sr-only">게시글 검색</label><input id="cq" className="input" placeholder="제목·내용 검색" value={q} maxLength={50} onChange={(e) => setQ(e.target.value)} /><button className="btn-ghost shrink-0 border border-ink-line">검색</button>
      </form>
      <div className="flex flex-wrap items-center gap-1">
        {CATS.map((c) => <button key={c} aria-pressed={cat === c} onClick={() => setCat(c)} className={`rounded-full px-3 py-1 text-xs font-semibold ${cat === c ? 'bg-ink text-white' : 'border border-ink-line text-ink-soft'}`}>{c || '전체'}</button>)}
        <span className="ml-auto" />
        {(['recent', 'popular'] as const).map((s) => <button key={s} aria-pressed={sort === s} onClick={() => setSort(s)} className={`text-xs ${sort === s ? 'font-bold text-ink' : 'text-ink-mute'}`}>{s === 'recent' ? '최신순' : '인기순'}</button>)}
      </div>
      {list.loading ? <Spinner /> : list.error ? <ErrorBox message={list.error.message} onRetry={list.reload} /> : list.data!.items.length === 0 ? <p className="card p-8 text-center text-sm text-ink-mute">글이 없어요.</p> : (
        <ul className="card divide-y divide-ink-line/70">{list.data!.items.map((p) => (
          <li key={p.id}><Link href={`/community/${p.id}`} className="block p-4 hover:bg-paper">
            <div className="flex flex-wrap gap-1"><Badge tone="mute">{p.category}</Badge>{p.certName && <Badge>{p.certName}</Badge>}{p.origin === 'STUDY_ROOM' && <Badge tone="clear">스터디룸 작성</Badge>}</div>
            <p className="mt-1 font-bold">{p.title}</p><p className="line-clamp-2 text-sm text-ink-soft">{p.body}</p>
            <p className="mt-1 text-xs text-ink-mute">{p.author} · 좋아요 {p.likeCount} · 댓글 {p.commentCount} · 조회 {p.viewCount}</p>
          </Link></li>
        ))}</ul>
      )}
    </div>
  );
}
