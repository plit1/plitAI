/** 광고 규칙 (데모 GX_POLICY.ads·gxBuildFeed·gxAdMetrics 이관) — 순수 함수 */
export const AD_POLICY = { every: 4, order: ['INSURANCE', 'ACADEMY', 'HR', 'ETC'] };
export const AD_CATEGORY: Record<string, string> = { INSURANCE: '보험', ACADEMY: '교육', HR: '채용', ETC: '기타' };
export const DEDUPE_EVENTS = ['IMPRESSION', 'FORM_START'];
export const EVENT_TYPES = ['IMPRESSION', 'CLICK', 'FORM_START'];
export const AD_CONSENT_VERSION = 'ad-consent-2026-11';
export const PHONE_RE = /^01[016789]-?\d{3,4}-?\d{4}$/;

export const sortCampaigns = <T extends { category: string }>(list: T[]) => [...list].sort((a, b) => AD_POLICY.order.indexOf(a.category) - AD_POLICY.order.indexOf(b.category));

/** 카드 n장마다 광고 1개, 같은 광고 연속 금지 (데모 gxBuildFeed) */
export function buildFeed<T, C extends { id: string }>(items: T[], campaigns: C[], every = AD_POLICY.every) {
  const out: ({ type: 'item'; item: T } | { type: 'ad'; campaign: C; placement: string })[] = [];
  let i = 0, last: string | null = null;
  items.forEach((it, idx) => {
    out.push({ type: 'item', item: it });
    if ((idx + 1) % every === 0 && campaigns.length) {
      const c = campaigns[i % campaigns.length];
      if (c.id !== last) { out.push({ type: 'ad', campaign: c, placement: `feed-${i}` }); last = c.id; }
      i++;
    }
  });
  return out;
}

export const rate = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

export function metrics(input: { impressions: number; clicks: number; uniqueClicks: number; formStarts: number; leads: { status: string; duplicateOfId: string | null }[]; revenue: number }) {
  const s = input.leads.length, ap = input.leads.filter((l) => l.status === 'APPROVED').length;
  return {
    impressions: input.impressions, clicks: input.clicks, uniqueClicks: input.uniqueClicks, formStarts: input.formStarts, submits: s, approved: ap,
    rejected: input.leads.filter((l) => l.status === 'REJECTED').length, pending: input.leads.filter((l) => l.status === 'PENDING').length,
    reversed: input.leads.filter((l) => l.status === 'REVERSED').length, duplicates: input.leads.filter((l) => l.duplicateOfId).length,
    ctr: rate(input.uniqueClicks, input.impressions), cvr: rate(s, input.uniqueClicks), approvalRate: rate(ap, s), revenue: input.revenue, revenuePerDb: ap > 0 ? Math.round(input.revenue / ap) : null,
  };
}
export const maskPhone = (last4: string | null) => (last4 ? `010-****-${last4}` : null);
