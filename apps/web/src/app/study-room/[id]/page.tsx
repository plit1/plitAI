'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { api, ApiError, currentToken, refresh, wsOrigin } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/use-api';
import { Badge, ErrorBox, Spinner } from '@/components/ui';

interface Msg { id: string; authorId: string; author: string; body: string; createdAt: string }
interface Summary { certName: string; round: string; state: 'ACTIVE' | 'READ_ONLY' | 'ARCHIVED'; readOnlyUntil: string | null; participants: number; canWrite: boolean; autoShare: boolean; notice: { version: string; text: string; acknowledged: boolean } }
interface Post { id: string; category: string; title: string; author: string; createdAt: string; commentCount: number; isPublic: boolean }
type Ack = { ok: true; data?: any } | { ok: false; code: string; message: string };
const CATS = ['질문', '응원', '학습 기록', '합격 후기'];

export default function StudyRoom() {
  const { id } = useParams<{ id: string }>();
  const { me } = useAuth();
  const [tab, setTab] = useState<'chat' | 'posts'>('chat');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState(''); const [err, setErr] = useState<string | null>(null); const [fatal, setFatal] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const sock = useRef<Socket | null>(null); const bottom = useRef<HTMLDivElement>(null);
  const posts = useApi<{ items: Post[] }>(tab === 'posts' ? `/study-rooms/${id}/posts` : null);
  const [form, setForm] = useState({ category: '질문', title: '', body: '' }); const [ack, setAck] = useState(false);

  useEffect(() => {
    if (!me) return;
    let s: Socket | null = null;
    (async () => {
      if (!currentToken()) await refresh();
      s = io(`${wsOrigin()}/study-room`, { auth: { token: currentToken() }, transports: ['websocket'] });
      sock.current = s;
      s.on('connect', () => {
        setLive(true);
        s!.emit('join', { roomId: id }, (r: Ack) => {
          if (!r.ok) { setFatal(r.message); return; }
          setSummary(r.data.summary); setMsgs(r.data.messages);
        });
      });
      s.on('disconnect', () => setLive(false));
      s.on('connect_error', async () => { setLive(false); if (await refresh()) { s!.auth = { token: currentToken() }; } });
      s.on('message', (m: Msg) => setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m])));
    })();
    return () => { s?.close(); };
  }, [id, me]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [msgs.length]);

  const send = (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    sock.current?.emit('send', { roomId: id, body: text }, (r: Ack) => { if (r.ok) setText(''); else setErr(r.message); });
  };
  const report = async (m: Msg) => {
    const reason = window.prompt('신고 사유를 입력해주세요'); if (!reason) return;
    try { await api('/reports', { method: 'POST', json: { targetType: 'CHAT', targetId: m.id, reason } }); setMsgs((p) => p.filter((x) => x.id !== m.id)); }
    catch (e2) { setErr(e2 instanceof ApiError ? e2.message : '신고하지 못했어요.'); }
  };
  const writePost = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    try {
      await api(`/study-rooms/${id}/posts`, { method: 'POST', json: { ...form, ack: ack || undefined } });
      setForm({ category: '질문', title: '', body: '' }); posts.reload();
      if (summary) setSummary({ ...summary, notice: { ...summary.notice, acknowledged: summary.notice.acknowledged || ack } });
    } catch (e2) { setErr(e2 instanceof ApiError ? e2.message : '작성하지 못했어요.'); }
  };

  if (!me) return <p className="card p-6 text-sm"><Link href={`/login?next=/study-room/${id}`} className="font-semibold text-cobalt">로그인</Link> 후 이용할 수 있어요.</p>;
  if (fatal) return <ErrorBox message={fatal} />;
  if (!summary) return <Spinner label="스터디룸 입장 중" />;
  const needAck = summary.autoShare && !summary.notice.acknowledged;
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <header>
        <p className="text-xs text-ink-mute">{summary.round} · 참여자 {summary.participants}명 · <span className={live ? 'text-clear-deep' : 'text-risk'}>{live ? '실시간 연결됨' : '연결 끊김'}</span></p>
        <h1 className="text-xl font-black">{summary.certName} 스터디룸</h1>
      </header>
      {summary.state !== 'ACTIVE' && <p className="rounded-xl bg-gold-tint p-3 text-sm text-gold">{summary.state === 'READ_ONLY' ? `스터디룸이 종료돼 읽기 전용이에요. ${summary.readOnlyUntil ? new Date(summary.readOnlyUntil).toLocaleDateString('ko-KR') : ''} 이후 채팅은 삭제되고 게시글은 남아요.` : '보관된 스터디룸이에요. 게시글만 볼 수 있어요.'}</p>}
      <div className="flex gap-1" role="tablist">{(['chat', 'posts'] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === t ? 'bg-ink text-white' : 'text-ink-soft'}`}>{t === 'chat' ? '채팅' : '게시판'}</button>)}</div>
      {err && <p role="alert" className="text-sm text-risk">{err}</p>}

      {tab === 'chat' ? (
        <section className="card flex h-[60vh] flex-col" aria-label="채팅">
          <ol className="flex-1 space-y-2 overflow-y-auto p-4" aria-live="polite">
            {msgs.length === 0 && <li className="text-center text-sm text-ink-mute">첫 메시지를 남겨보세요.</li>}
            {msgs.map((m) => {
              const mine = m.authorId === me.id;
              return (
                <li key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  {!mine && <span className="text-[11px] text-ink-mute">{m.author}</span>}
                  <span className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-cobalt text-white' : 'bg-paper'}`}>{m.body}</span>
                  {!mine && <button className="text-[10px] text-ink-mute hover:text-risk" onClick={() => report(m)}>신고</button>}
                </li>
              );
            })}
            <div ref={bottom} />
          </ol>
          <form onSubmit={send} className="flex gap-2 border-t border-ink-line p-3">
            <label htmlFor="chat" className="sr-only">메시지</label>
            <input id="chat" className="input" maxLength={300} disabled={!summary.canWrite || !live} placeholder={summary.canWrite ? '메시지 (연락처·외부 링크 금지)' : '작성할 수 없어요'} value={text} onChange={(e) => setText(e.target.value)} />
            <button className="btn-primary shrink-0" disabled={!summary.canWrite || !live || !text.trim()}>보내기</button>
          </form>
        </section>
      ) : (
        <section className="space-y-3" aria-label="게시판">
          {summary.canWrite && (
            <form onSubmit={writePost} className="card grid gap-2 p-4">
              <div className="flex gap-2"><label htmlFor="cat" className="sr-only">카테고리</label><select id="cat" className="input w-32" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
                <label htmlFor="pt" className="sr-only">제목</label><input id="pt" className="input" placeholder="제목" maxLength={60} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <label htmlFor="pb" className="sr-only">내용</label><textarea id="pb" rows={3} className="input" placeholder="내용" maxLength={2000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
              {needAck && <label className="flex items-start gap-2 rounded-lg bg-cobalt-tint p-2 text-xs text-cobalt"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />{summary.notice.text}</label>}
              <button className="btn-primary" disabled={needAck && !ack}>글 올리기</button>
            </form>
          )}
          {posts.loading ? <Spinner /> : (
            <ul className="card divide-y divide-ink-line/70">{(posts.data?.items ?? []).length === 0 ? <li className="p-6 text-center text-sm text-ink-mute">아직 글이 없어요.</li> : posts.data!.items.map((p) => (
              <li key={p.id}><Link href={`/community/${p.id}`} className="block p-3 hover:bg-paper"><p className="text-sm font-semibold"><Badge tone="mute">{p.category}</Badge> {p.title} {!p.isPublic && <Badge tone="gold">참여자 전용</Badge>}</p><p className="text-xs text-ink-mute">{p.author} · 댓글 {p.commentCount}</p></Link></li>
            ))}</ul>
          )}
        </section>
      )}
    </div>
  );
}
