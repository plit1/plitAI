'use client';
import { useState } from 'react';
import { api, ApiError, won } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/use-api';
import { Badge, Chip, Spinner } from '@/components/ui';
import { AdminError, AdminShell, fmtDate } from '@/components/admin';

interface M { impressions: number; uniqueClicks: number; submits: number; approved: number; pending: number; duplicates: number; ctr: number | null; cvr: number | null; approvalRate: number | null; revenue: number }
interface Camp { id: string; title: string; category: string; advertiserName: string; cpaPrice: number; status: string; isDemo: boolean; collectsContact: boolean; reviewNote: string | null; metrics: M }
interface Lead { id: string; campaignId: string; campaign: { title: string }; answers: { topic: string }; status: string; duplicateOfId: string | null; priceSnapshot: number | null; phone: string | null; createdAt: string; rejectReason: string | null }
const pct = (v: number | null) => (v === null ? '–' : `${v}%`);
const EMPTY = { category: 'ACADEMY', advertiserName: '', title: '', description: '', ctaText: '상담 신청', cpaPrice: 10000, topics: '', collectsContact: false };

export default function AdminAds() {
  const { me } = useAuth();
  const camps = useApi<{ items: Camp[]; total: { revenue: number; approved: number; pending: number }; contactCollection: string; leadDelivery: string }>('/admin/ads/campaigns');
  const [leadStatus, setLeadStatus] = useState('PENDING');
  const leads = useApi<Lead[]>(`/admin/ads/leads${leadStatus ? `?status=${leadStatus}` : ''}`);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState<{ code?: string; message: string } | null>(null); const [ok, setOk] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, msg: string) => { setErr(null); setOk(null); try { await fn(); setOk(msg); camps.reload(); leads.reload(); } catch (e) { setErr(e instanceof ApiError ? e : { message: '처리하지 못했어요.' }); } };
  const setStatus = (c: Camp, status: string) => { const note = status === 'REJECTED' ? window.prompt('반려 사유') : undefined; if (status === 'REJECTED' && !note) return; run(() => api(`/admin/ads/campaigns/${c.id}/status`, { method: 'PATCH', json: { status, note } }), '상태를 바꿨어요.'); };
  const decide = (l: Lead, action: 'APPROVE' | 'REJECT' | 'REVERSE') => { const note = action === 'APPROVE' ? undefined : window.prompt(action === 'REJECT' ? '거절 사유' : '승인 취소 사유'); if (action !== 'APPROVE' && !note) return; run(() => api(`/admin/ads/leads/${l.id}/decide`, { method: 'POST', json: { action, note } }), '처리했어요.'); };
  const price = (c: Camp) => { const v = window.prompt(`${c.title} 유효 DB 단가(원) — 이후 승인분부터 적용`, String(c.cpaPrice)); if (v) run(() => api(`/admin/ads/campaigns/${c.id}/price`, { method: 'PATCH', json: { cpaPrice: Number(v) } }), '단가를 바꿨어요.'); };
  const create = () => run(() => api('/admin/ads/campaigns', { method: 'POST', json: { ...f, detail: [], targetFields: ['all'], topics: f.topics.split(',').map((x) => x.trim()).filter(Boolean) } }).then(() => setF(EMPTY)), '심사 대기로 등록했어요.');
  const NEXT: Record<string, [string, string][]> = { PENDING_REVIEW: [['ACTIVE', '승인·게재'], ['REJECTED', '반려']], ACTIVE: [['PAUSED', '일시중지'], ['ENDED', '종료']], PAUSED: [['ACTIVE', '재개'], ['ENDED', '종료']], REJECTED: [['PENDING_REVIEW', '재심사']], ENDED: [] };
  return (
    <AdminShell title="광고·제휴">
      {camps.data && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="card px-3 py-2">인정 매출 <b>{won(camps.data.total.revenue)}</b> · 승인 {camps.data.total.approved} · 대기 {camps.data.total.pending}</span>
          <span className="card px-3 py-2">연락처 수집 <Badge tone={camps.data.contactCollection === 'ENABLED' ? 'clear' : 'mute'}>{camps.data.contactCollection === 'ENABLED' ? '허용' : '승인 전 차단'}</Badge></span>
          <span className="card px-3 py-2">광고주 전달 <Badge tone="mute">미구현</Badge></span>
        </div>
      )}
      {ok && <p role="status" className="text-sm text-clear-deep">{ok}</p>}
      {err && <AdminError code={err.code} message={err.message} />}
      {camps.loading ? <Spinner /> : (
        <div className="card overflow-x-auto"><table className="w-full text-left text-xs">
          <thead className="bg-paper text-ink-mute"><tr><th className="p-2">캠페인</th><th className="p-2">상태</th><th className="p-2">노출</th><th className="p-2">고유 클릭</th><th className="p-2">CTR</th><th className="p-2">신청</th><th className="p-2">승인율</th><th className="p-2">단가</th><th className="p-2">매출</th><th /></tr></thead>
          <tbody>{camps.data?.items.map((c) => (
            <tr key={c.id} className="border-t border-ink-line/60">
              <td className="p-2"><b>{c.title}</b><br /><span className="text-ink-mute">{c.advertiserName} {c.isDemo && '(예시)'} {c.collectsContact && '· 연락처 수집'}</span></td>
              <td className="p-2">{c.status}</td><td className="p-2">{c.metrics.impressions}</td><td className="p-2">{c.metrics.uniqueClicks}</td><td className="p-2">{pct(c.metrics.ctr)}</td>
              <td className="p-2">{c.metrics.submits}{c.metrics.duplicates ? ` (중복 ${c.metrics.duplicates})` : ''}</td><td className="p-2">{pct(c.metrics.approvalRate)}</td>
              <td className="p-2">{won(c.cpaPrice)}{me?.role === 'SUPER_ADMIN' && <button className="ml-1 text-cobalt" onClick={() => price(c)}>변경</button>}</td><td className="p-2">{won(c.metrics.revenue)}</td>
              <td className="whitespace-nowrap p-2">{NEXT[c.status]?.map(([s, l]) => <button key={s} className="mr-2 text-cobalt" onClick={() => setStatus(c, s)}>{l}</button>)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <section className="space-y-2" aria-labelledby="leads">
        <h2 id="leads" className="text-sm font-bold">상담 신청 (유효 DB 심사)</h2>
        <div className="flex gap-1">{['PENDING', 'APPROVED', 'REJECTED', 'REVERSED', ''].map((s) => <Chip key={s} on={leadStatus === s} onClick={() => setLeadStatus(s)}>{s || '전체'}</Chip>)}</div>
        {leads.loading ? <Spinner /> : (
          <div className="card overflow-x-auto"><table className="w-full text-left text-xs">
            <thead className="bg-paper text-ink-mute"><tr><th className="p-2">일시</th><th className="p-2">캠페인</th><th className="p-2">주제</th><th className="p-2">연락처</th><th className="p-2">상태</th><th /></tr></thead>
            <tbody>{leads.data!.length === 0 ? <tr><td colSpan={6} className="p-6 text-center text-ink-mute">신청이 없어요.</td></tr> : leads.data!.map((l) => (
              <tr key={l.id} className="border-t border-ink-line/60"><td className="p-2">{fmtDate(l.createdAt)}</td><td className="p-2">{l.campaign.title}</td><td className="p-2">{l.answers.topic}</td><td className="p-2">{l.phone ?? '수집 안 함'}</td>
                <td className="p-2">{l.status}{l.duplicateOfId && <Badge tone="risk">중복</Badge>}{l.priceSnapshot ? ` · ${won(l.priceSnapshot)}` : ''}</td>
                <td className="whitespace-nowrap p-2">{l.status === 'PENDING' && <>{!l.duplicateOfId && <button className="text-cobalt" onClick={() => decide(l, 'APPROVE')}>유효 승인</button>} <button className="text-risk" onClick={() => decide(l, 'REJECT')}>거절</button></>}{l.status === 'APPROVED' && <button className="text-risk" onClick={() => decide(l, 'REVERSE')}>승인 취소</button>}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      <section className="card space-y-2 p-5" aria-labelledby="new-ad">
        <h2 id="new-ad" className="text-sm font-bold">캠페인 등록 (심사 대기로 생성)</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-semibold text-ink-soft">분류<select className="input mt-1" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="INSURANCE">보험</option><option value="ACADEMY">교육</option><option value="HR">채용</option><option value="ETC">기타</option></select></label>
          <label className="text-xs font-semibold text-ink-soft">광고주<input className="input mt-1" value={f.advertiserName} onChange={(e) => setF({ ...f, advertiserName: e.target.value })} /></label>
          <label className="text-xs font-semibold text-ink-soft">제목<input className="input mt-1" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label className="text-xs font-semibold text-ink-soft">버튼 문구<input className="input mt-1" value={f.ctaText} onChange={(e) => setF({ ...f, ctaText: e.target.value })} /></label>
          <label className="text-xs font-semibold text-ink-soft">설명<input className="input mt-1" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
          <label className="text-xs font-semibold text-ink-soft">상담 주제 (쉼표)<input className="input mt-1" value={f.topics} onChange={(e) => setF({ ...f, topics: e.target.value })} /></label>
          <label className="text-xs font-semibold text-ink-soft">유효 DB 단가(원)<input type="number" className="input mt-1" value={f.cpaPrice} onChange={(e) => setF({ ...f, cpaPrice: Number(e.target.value) })} /></label>
          <label className="flex items-center gap-2 pt-5 text-xs font-semibold text-ink-soft"><input type="checkbox" checked={f.collectsContact} onChange={(e) => setF({ ...f, collectsContact: e.target.checked })} />연락처 수집 (개인정보 제3자 제공 승인 필요)</label>
        </div>
        <button className="btn-primary" onClick={create}>등록</button>
      </section>
    </AdminShell>
  );
}
