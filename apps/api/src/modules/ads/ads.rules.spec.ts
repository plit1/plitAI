import { buildFeed, metrics, PHONE_RE, sortCampaigns } from './ads.rules';

describe('광고 규칙', () => {
  it('카드 4장마다 광고 1개, 보험→교육→채용 순 순환', () => {
    const camps = sortCampaigns([{ id: 'h', category: 'HR' }, { id: 'i', category: 'INSURANCE' }, { id: 'a', category: 'ACADEMY' }]);
    const feed = buildFeed(Array.from({ length: 13 }, (_, i) => i), camps);
    const ads = feed.filter((f) => f.type === 'ad') as { campaign: { id: string }; placement: string }[];
    expect(ads.map((a) => a.campaign.id)).toEqual(['i', 'a', 'h']);
    expect(feed.findIndex((f) => f.type === 'ad')).toBe(4);
    expect(ads.map((a) => a.placement)).toEqual(['feed-0', 'feed-1', 'feed-2']);
  });
  it('광고 1개뿐이면 연속 노출하지 않음, 광고 없으면 카드만', () => {
    expect(buildFeed(Array.from({ length: 12 }, (_, i) => i), [{ id: 'x' }]).filter((f) => f.type === 'ad')).toHaveLength(1);
    expect(buildFeed([1, 2, 3, 4], [])).toHaveLength(4);
  });
  it('지표: CTR 은 고유 클릭/노출, 승인율, DB 당 매출', () => {
    const m = metrics({ impressions: 200, clicks: 12, uniqueClicks: 10, formStarts: 5, revenue: 45000, leads: [{ status: 'APPROVED', duplicateOfId: null }, { status: 'APPROVED', duplicateOfId: null }, { status: 'PENDING', duplicateOfId: 'x' }, { status: 'REJECTED', duplicateOfId: null }] });
    expect(m).toMatchObject({ ctr: 5, cvr: 40, approvalRate: 50, revenuePerDb: 22500, duplicates: 1, pending: 1 });
    expect(metrics({ impressions: 0, clicks: 0, uniqueClicks: 0, formStarts: 0, revenue: 0, leads: [] }).ctr).toBeNull();
  });
  it('휴대전화 형식', () => {
    expect(PHONE_RE.test('010-1234-5678')).toBe(true); expect(PHONE_RE.test('01012345678')).toBe(true);
    expect(PHONE_RE.test('02-123-4567')).toBe(false);
  });
});
