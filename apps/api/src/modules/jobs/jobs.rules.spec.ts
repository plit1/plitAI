import { keywordsFor, lifecycle, matchJob, MyCert } from './jobs.rules';

const now = new Date('2026-11-09T03:00:00Z');
const day = (n: number) => new Date(now.getTime() + n * 86400000);
const job = (o: Partial<Parameters<typeof matchJob>[0]> = {}) => ({ id: 'j', title: '전기안전관리자 신입', companyName: 'A', description: '', workLocation: '경기 화성', region: '경기', employmentType: '정규직', experience: 'ANY', requiredCerts: ['electric'], preferredCerts: [], categories: ['전기안전관리', '전기설비'], expiresAt: day(12), ...o });
const ctx = (certs: MyCert[], profile = { regions: [] as string[], roles: [] as string[], experience: null as string | null, employment: [] as string[] }) => ({ certs, profile, keywords: (id: string) => keywordsFor(id, undefined, {}), now });
const electric = (status: MyCert['status']): MyCert => ({ certId: 'electric', name: '전기기사', status });

describe('취업 매칭 (데모 JB_MATCHER 이관)', () => {
  it('필수 자격증 보유 + 관련 직무 → HIGH', () => {
    const m = matchJob(job(), ctx([electric('VERIFIED')]));
    expect(m).toMatchObject({ level: 'HIGH', score: 45 + 18 + 7 + 4 });
    expect(m.reasons[0]).toContain('전기기사 자격증이 필수조건');
  });
  it('준비 중 자격증은 점수 낮춤 + 취득 후 지원 안내', () => {
    const m = matchJob(job(), ctx([electric('PREPARING')]));
    expect(m.score).toBe(26 + 18 + 7 + 4);
    expect(m.reasons[0]).toContain('준비 중인 전기기사');
  });
  it('희망 지역 일치 +14 / 불일치 −8, 경력 불일치 −10', () => {
    const p = { regions: ['경기'], roles: [], experience: 'NEW', employment: [] };
    expect(matchJob(job(), ctx([electric('CLAIMED')], p)).score).toBe(45 + 18 + 14 + 7 + 4);
    expect(matchJob(job({ region: '부산', experience: 'EXP' }), ctx([electric('CLAIMED')], p)).score).toBe(45 + 18 - 8 - 10 + 4);
  });
  it('마감 공고는 CLOSED, 3일 이내 마감 임박', () => {
    expect(matchJob(job({ expiresAt: day(-1) }), ctx([electric('VERIFIED')])).level).toBe('CLOSED');
    expect(lifecycle({ expiresAt: day(2) }, now)).toBe('CLOSING_SOON');
    expect(lifecycle({ expiresAt: null }, now)).toBe('ACTIVE');
    expect(matchJob(job({ expiresAt: day(0) }), ctx([electric('VERIFIED')])).reasons).toContain('오늘 마감되는 공고예요.');
  });
  it('자격증 없이 관련성 낮으면 LOW', () => {
    expect(matchJob(job({ requiredCerts: [], categories: ['조리'] }), ctx([])).level).toBe('LOW');
  });
  it('키워드: 관리자 수정 > 기본 맵 > 분야 대체', () => {
    expect(keywordsFor('electric', 'biz', { electric: ['배전'] })).toEqual(['배전']);
    expect(keywordsFor('electric', 'biz', {})).toContain('전기안전관리');
    expect(keywordsFor('unknown', 'food', {})).toEqual(['조리', '매장관리']);
  });
});
