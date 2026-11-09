'use client';
import { useState } from 'react';
import { api, ApiError, currentToken, pts, won } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { Badge, Spinner } from '@/components/ui';
import { AdminError, AdminShell } from '@/components/admin';

interface Stats { activeUsers: number; enrollments: Record<string, number>; revenue: { paidCount: number; paidAmount: number; refundedCount: number; refundedAmount: number }; pendingReviews: number; pointsIssued: number }
interface Item { id: string; examNumber: string; submittedAt: string; note: string | null; hasEvidence: boolean; examRound: { label: string | null } | null; user: { nickname: string }; enrollment: { plan: string; certId: string; rewardSnapshot: number } }

export default function Admin() {
  const stats = useApi<Stats>('/admin/stats');
  const queue = useApi<Item[]>('/admin/verifications');
  const ai = useApi<{ days: number; totalUsd: number; rows: { model: string; success: boolean; calls: number }[] }>('/admin/ai-usage?days=30');
  const [msg, setMsg] = useState<string | null>(null);
  /** 증빙은 인증 헤더가 필요해 fetch → blob URL 로 새 창 (열람은 서버 감사 로그에 기록) */
  const viewEvidence = async (id: string) => {
    const r = await fetch(`/api/v1/admin/verifications/${id}/evidence`, { headers: { Authorization: `Bearer ${currentToken()}` } });
    if (!r.ok) { setMsg('증빙을 열지 못했어요.'); return; }
    const url = URL.createObjectURL(await r.blob());
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  const review = async (id: string, decision: string) => {
    const note = decision === 'NEEDS_FIX' || decision === 'REJECT' ? window.prompt('사유를 입력해주세요') ?? '' : undefined;
    if (note === '') return;
    try { const r = await api<{ status: string; reward: number }>(`/admin/verifications/${id}/review`, { method: 'POST', json: { decision, note } }); setMsg(`처리 완료: ${r.status}${r.reward ? ` · ${pts(r.reward)} 지급` : ''}`); queue.reload(); stats.reload(); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : '처리하지 못했어요.'); }
  };
  const s = stats.data;
  return (
    <AdminShell title="대시보드 · 합격 인증 심사">
      {stats.error && <AdminError code={stats.error.code} message={stats.error.message} />}
      {s && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[['활성 회원', `${s.activeUsers}명`], ['참여 (런/부스터)', `${s.enrollments.FREE ?? 0} / ${s.enrollments.PREMIUM ?? 0}`], ['결제 (건/금액)', `${s.revenue.paidCount}건 · ${won(s.revenue.paidAmount)}`], ['심사 대기', `${s.pendingReviews}건`]].map(([k, v]) => (
            <div key={k} className="card p-4"><dt className="text-xs text-ink-mute">{k}</dt><dd className="mt-1 font-black">{v}</dd></div>
          ))}
        </dl>
      )}
      {ai.data && (
        <p className="card p-4 text-sm">AI 코칭 (최근 {ai.data.days}일): 호출 {ai.data.rows.reduce((n, r) => n + r.calls, 0)}회 · 실패·폴백 {ai.data.rows.filter((r) => !r.success).reduce((n, r) => n + r.calls, 0)}회 · 비용 약 ${ai.data.totalUsd.toFixed(4)}</p>
      )}
      <section aria-labelledby="q">
        <h2 id="q" className="mb-2 text-lg font-black">합격 인증 심사</h2>
        {msg && <p role="status" className="mb-2 text-sm text-cobalt">{msg}</p>}
        {queue.loading ? <Spinner /> : queue.error ? <AdminError code={queue.error.code} message={queue.error.message} /> : queue.data!.length === 0 ? <p className="card p-6 text-center text-sm text-ink-mute">대기 중인 심사가 없어요.</p> : (
          <ul className="space-y-2">{queue.data!.map((v) => (
            <li key={v.id} className="card flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div><p className="font-bold">{v.user.nickname} · {v.enrollment.certId} <Badge>{v.enrollment.plan}</Badge></p><p className="text-xs text-ink-mute">수험번호 {v.examNumber}{v.examRound?.label && ` · ${v.examRound.label}`} · 보상 {pts(v.enrollment.rewardSnapshot)} · {new Date(v.submittedAt).toLocaleString('ko-KR')}</p>{v.note && <p className="text-xs text-gold">{v.note}</p>}</div>
              <div className="flex gap-1">
                {v.hasEvidence && <button className="btn-ghost border border-ink-line px-3 py-2" onClick={() => viewEvidence(v.id)}>증빙 보기</button>}
                <button className="btn-primary px-3 py-2" onClick={() => review(v.id, 'APPROVE')}>승인</button>
                <button className="btn-ghost px-3 py-2" onClick={() => review(v.id, 'NEEDS_FIX')}>보완</button>
                <button className="btn-ghost px-3 py-2" onClick={() => review(v.id, 'FAIL')}>불합격</button>
                <button className="btn-ghost px-3 py-2 text-risk" onClick={() => review(v.id, 'REJECT')}>반려</button>
              </div>
            </li>
          ))}</ul>
        )}
      </section>
    </AdminShell>
  );
}
