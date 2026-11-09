'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { adEvent, adSessionId } from '@/lib/ads';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/use-api';
import { AdCampaign } from '@/components/ads';
import { Badge, ErrorBox, Spinner } from '@/components/ui';

export default function AdDetail() {
  const { id } = useParams<{ id: string }>(); const { me } = useAuth();
  const placement = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('p') ?? 'ad-detail' : 'ad-detail';
  const { data: c, error, loading, reload } = useApi<AdCampaign>(`/ads/${id}`);
  const [f, setF] = useState({ topic: '', name: '', phone: '', privacy: false, thirdParty: false });
  const [done, setDone] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const started = useRef(false);
  const start = () => { if (!started.current && c) { started.current = true; adEvent(c.id, 'FORM_START', placement); } };
  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error.message} onRetry={reload} />;
  if (!c) return null;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    try {
      const r = await api<{ message: string; duplicate: boolean }>(`/ads/${c.id}/leads`, { method: 'POST', json: { answers: { topic: f.topic }, consentPrivacy: f.privacy, consentThirdParty: f.thirdParty, sessionId: adSessionId(), placement, ...(c.collectsContact ? { name: f.name, phone: f.phone } : {}) } });
      setDone(r.duplicate ? '이미 신청한 광고예요. 같은 신청은 한 번만 처리돼요.' : r.message);
    } catch (e2) { setErr(e2 instanceof ApiError ? e2.message : '잠시 후 다시 시도해주세요.'); }
  };
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <article className="card space-y-3 p-5">
        <div className="flex flex-wrap gap-1"><Badge tone="gold">광고</Badge><Badge tone="mute">{c.categoryLabel}</Badge>{c.isDemo && <Badge tone="mute">예시 광고주</Badge>}</div>
        <h1 className="text-xl font-black">{c.title}</h1>
        <p className="text-sm text-ink-soft">{c.description}</p>
        <ul className="space-y-1 text-sm">{c.detail.map((d) => <li key={d}>· {d}</li>)}</ul>
        <p className="text-xs text-ink-mute">광고주: {c.advertiserName}</p>
        <p role="note" className="rounded-xl bg-gold-tint p-3 text-xs text-gold">{c.disclosure}</p>
      </article>
      {done ? <p role="status" className="card p-5 text-sm font-semibold text-clear-deep">{done}</p> : !me ? (
        <p className="card p-5 text-sm"><Link href={`/login?next=/ads/${c.id}`} className="font-semibold text-cobalt">로그인</Link> 후 신청할 수 있어요.</p>
      ) : (
        <form className="card space-y-3 p-5" onSubmit={submit} onFocusCapture={start} aria-label={`${c.ctaText} 신청서`}>
          <h2 className="text-sm font-bold">{c.ctaText}</h2>
          <label className="block text-xs font-semibold text-ink-soft">상담 주제<select className="input mt-1" required value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })}><option value="">선택해주세요</option>{c.topics.map((t) => <option key={t}>{t}</option>)}</select></label>
          {c.collectsContact ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs font-semibold text-ink-soft">이름<input className="input mt-1" maxLength={20} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
              <label className="text-xs font-semibold text-ink-soft">휴대전화<input className="input mt-1" inputMode="tel" placeholder="010-0000-0000" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
            </div>
          ) : <p className="text-xs text-ink-mute">이 광고는 연락처를 받지 않아요.</p>}
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={f.privacy} onChange={(e) => setF({ ...f, privacy: e.target.checked })} />[필수] 상담 신청을 위한 개인정보 수집·이용에 동의해요</label>
          {c.collectsContact && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={f.thirdParty} onChange={(e) => setF({ ...f, thirdParty: e.target.checked })} />[필수] 광고주({c.advertiserName})에게 이름·연락처·상담 주제 제공에 동의해요</label>}
          {err && <p role="alert" className="text-sm text-risk">{err}</p>}
          <button className="btn-primary w-full" disabled={!f.topic || !f.privacy || (c.collectsContact && !f.thirdParty)}>신청하기</button>
        </form>
      )}
    </div>
  );
}
