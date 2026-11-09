'use client';
import { api } from './api';

/** 광고 측정용 익명 세션 ID (기기별, 개인 식별 정보 아님) */
export function adSessionId() {
  try {
    let v = localStorage.getItem('plit_ad_sid');
    if (!v) { v = `s_${crypto.randomUUID().replace(/-/g, '')}`; localStorage.setItem('plit_ad_sid', v); }
    return v;
  } catch { return `s_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`; }
}
export function adEvent(campaignId: string, eventType: 'IMPRESSION' | 'CLICK' | 'FORM_START', placement: string) {
  api('/ads/events', { method: 'POST', json: { campaignId, eventType, sessionId: adSessionId(), placement } }).catch(() => undefined);
}
