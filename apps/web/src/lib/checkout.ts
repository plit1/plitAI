import { api } from './api';

/** 서버 승인 → 기존 참여면 서버가 부스터로 전환, 없으면 PREMIUM 참여 → 대시보드 경로 반환 (MOCK·토스 공통) */
export async function confirmAndEnroll(offeringId: string, orderNo: string, paymentKey: string, amount: number) {
  await api('/payments/confirm', { method: 'POST', json: { orderNo, paymentKey, amount } });
  const mine = await api<{ id: string; offering: { id: string } }[]>('/me/enrollments');
  let enr = mine.find((e) => e.offering.id === offeringId);
  if (!enr) {
    const j = await api<{ enrollment: { id: string } }>(`/challenges/${offeringId}/join`, { method: 'POST', json: { plan: 'PREMIUM' } });
    enr = { id: j.enrollment.id, offering: { id: offeringId } };
  }
  return `/dashboard/${enr.id}?paid=1`;
}
