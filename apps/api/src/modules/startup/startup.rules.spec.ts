import { autoIndustry, matchProgram, programLife, ROADMAP, SINBO } from './startup.rules';

const now = new Date('2026-11-09T03:00:00Z');
const day = (n: number) => new Date(now.getTime() + n * 86400000);
const prog = (o = {}) => ({ title: 't', region: '경기', sigungu: null as string | null, targetStages: ['PREP'], industries: ['NAIL'], applyStart: day(-5), applyEnd: day(20), ...o });
const profile = { industry: 'NAIL', sido: '경기', sigungu: '수원시', stage: 'PREP' };

describe('창업 매칭 (데모 SU_MATCHER 이관)', () => {
  it('업종·지역·단계 일치 → HIGH (30+18+10)', () => {
    expect(matchProgram(prog(), { industry: 'NAIL', profile, now })).toMatchObject({ score: 58, level: 'HIGH' });
  });
  it('전국 대상 +8, 시군구 일치 +10 / 다른 시군구 −6, 다른 시도 −30', () => {
    expect(matchProgram(prog({ region: '전국' }), { industry: 'NAIL', profile, now }).score).toBe(30 + 8 + 10);
    expect(matchProgram(prog({ sigungu: '수원시' }), { industry: 'NAIL', profile, now }).score).toBe(30 + 18 + 10 + 10);
    expect(matchProgram(prog({ sigungu: '화성시' }), { industry: 'NAIL', profile, now }).score).toBe(30 + 18 - 6 + 10);
    expect(matchProgram(prog({ region: '부산' }), { industry: 'NAIL', profile, now }).level).toBe('LOW');
  });
  it('전 업종(ALL) +10, 다른 업종 −25', () => {
    expect(matchProgram(prog({ industries: ['ALL'] }), { industry: 'NAIL', profile, now }).score).toBe(10 + 18 + 10);
    expect(matchProgram(prog({ industries: ['CAFE'] }), { industry: 'NAIL', profile, now }).score).toBe(-25 + 18 + 10);
  });
  it('접수 상태: 예정·마감 임박·마감', () => {
    expect(programLife({ applyStart: day(3), applyEnd: day(30) }, now)).toBe('UPCOMING');
    expect(programLife({ applyStart: day(-3), applyEnd: day(1) }, now)).toBe('CLOSING_SOON');
    expect(matchProgram(prog({ applyEnd: day(-1) }), { industry: 'NAIL', profile, now }).level).toBe('CLOSED');
  });
  it('자격증 → 업종: 검증 자격증 우선, 관리자 수정 우선', () => {
    expect(autoIndustry([{ certId: 'barista', status: 'PREPARING' }, { certId: 'hair', status: 'VERIFIED' }], {})).toMatchObject({ industry: 'HAIR', certId: 'hair' });
    expect(autoIndustry([{ certId: 'barista', status: 'CLAIMED' }], { barista: { industry: 'BAKERY', reason: 'x' } })!.industry).toBe('BAKERY');
    expect(autoIndustry([{ certId: 'electric', status: 'VERIFIED' }], {})).toBeNull();
  });
  it('데모 기준 데이터: 로드맵 6단계, 신용보증재단 17곳(공식 https 링크)', () => {
    expect(ROADMAP.map((r) => r.id)).toEqual(['goal', 'cert', 'permit', 'fund', 'market', 'open']);
    expect(Object.keys(SINBO)).toHaveLength(17);
    expect(Object.values(SINBO).every(([, url]) => url.startsWith('https://'))).toBe(true);
  });
});
