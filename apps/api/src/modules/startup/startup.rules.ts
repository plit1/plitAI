/** 창업하기 규칙 (데모 v2.9 SU_* 이관) — 순수 함수. 적합도는 정보 안내용이며 선정·지원자격을 보장하지 않는다. */
import data from '../../data/demo-jobs-startup.json';

export const INDUSTRIES: { code: string; name: string; chip: string; checks: string[] }[] = data.SU_INDUSTRIES;
export const CERT_INDUSTRY_DEFAULT: Record<string, { industry: string; reason: string }> = data.SU_CERT_MAP_DEFAULT;
export const SINBO: Record<string, [string, string]> = data.SU_SINBO as unknown as Record<string, [string, string]>;
export const STAGES: Record<string, { label: string }> = data.SU_STAGE;
export const SUPPORT_TYPES: Record<string, { label: string; desc: string }> = data.SU_TYPES;
export const PARTNER_CATEGORIES: Record<string, string> = data.SU_PCATS;
export const BUDGETS: string[] = data.SU_BUDGET;
export const SIDO: string[] = data.JB_REGIONS;
/** 6단계 로드맵: [id, 제목, 설명, 웹 경로] */
export const ROADMAP: { id: string; title: string; desc: string; path: string | null }[] = (data.SU_TASKS as unknown as [string, string, string, string | null][]).map(([id, title, desc, path]) => ({ id, title, desc, path }));
/** 파트너는 데모의 가상 업체 — 화면에 '예시' 로 표시하고 실제 제휴 전에는 연락처를 받지 않음 */
export const DEMO_PARTNERS = (data.SU_PARTNERS_RAW as unknown as [string, string, string, string, string[], string][]).map(([id, category, name, headline, regions, desc]) => ({ id, category, categoryLabel: PARTNER_CATEGORIES[category], name, headline, regions, desc, isDemo: true }));
/** 상권 정보: 공식 서비스 안내 (API 연동은 키·접근 승인 대기) */
export const MARKET_SOURCES = [
  { id: 'SBIZ365', name: '소상공인365 상권분석', url: 'https://bigdata.sbiz.or.kr', status: 'LINK_ONLY', note: '업종·지역별 상권 분석은 공식 서비스에서 확인해요.' },
  { id: 'SBIZ_STORE', name: '소상공인시장진흥공단 상가(상권)정보', url: 'https://www.data.go.kr/data/15012005/openapi.do', status: 'NOT_CONFIGURED', note: '공공데이터 API 키 발급 후 상가 분포 연동 예정' },
  { id: 'REB', name: '한국부동산원 상업용부동산 임대동향', url: 'https://www.data.go.kr/data/15134761/openapi.do', status: 'NOT_CONFIGURED', note: '통계 참고용 — 개별 점포 시세가 아니에요' },
];

const DAY = 86400000;
const kday = (d: Date) => Date.parse(new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10));
export const daysLeft = (applyEnd: Date | null, now: Date) => (applyEnd ? Math.round((kday(applyEnd) - kday(now)) / DAY) : null);

/** 데모 suLife */
export function programLife(p: { applyStart: Date | null; applyEnd: Date | null; status?: string }, now: Date) {
  if (p.status === 'HIDDEN') return 'HIDDEN';
  const d = daysLeft(p.applyEnd, now);
  if (d !== null && d < 0) return 'EXPIRED';
  if (p.applyStart && kday(p.applyStart) > kday(now)) return 'UPCOMING';
  if (d !== null && d <= 3) return 'CLOSING_SOON';
  return 'OPEN';
}

export interface ProgramLike { title: string; region: string; sigungu: string | null; targetStages: string[]; industries: string[]; applyStart: Date | null; applyEnd: Date | null; status?: string }
export interface StartupProfileLike { industry: string | null; sido: string; sigungu: string; stage: string }
const industryName = (code: string) => INDUSTRIES.find((i) => i.code === code)?.name ?? code;

/** 데모 SU_MATCHER rules-v1 */
export function matchProgram(p: ProgramLike, ctx: { industry: string | null; profile: StartupProfileLike; now: Date }) {
  const { industry, profile, now } = ctx;
  const reasons: string[] = [];
  const life = programLife(p, now);
  if (life === 'EXPIRED' || life === 'HIDDEN') return { score: -1, level: 'CLOSED' as const, reasons: ['접수가 마감된 공고예요.'], life };
  let score = 0;
  const all = p.industries.includes('ALL');
  if (industry && p.industries.includes(industry)) { score += 30; reasons.push(`${industryName(industry)} 업종을 대상으로 하는 공고예요.`); }
  else if (all) score += 10;
  else score -= 25;
  if (profile.sido) {
    if (p.region === '전국') { score += 8; reasons.push('전국 대상이라 지역 제한이 없어요.'); }
    else if (p.region === profile.sido) {
      score += 18;
      if (p.sigungu && p.sigungu === profile.sigungu) { score += 10; reasons.push(`${p.region} ${p.sigungu} 대상 공고예요.`); }
      else if (p.sigungu) { score -= 6; reasons.push(`${p.region} ${p.sigungu} 한정 공고예요. 대상 구역을 확인하세요.`); }
      else reasons.push(`희망 지역(${p.region}) 대상 공고예요.`);
    } else score -= 30;
  }
  if (p.targetStages.includes(profile.stage)) { score += 10; reasons.push(`${STAGES[profile.stage]?.label ?? profile.stage} 단계에 맞는 공고예요.`); }
  const d = daysLeft(p.applyEnd, now);
  if (life === 'CLOSING_SOON') reasons.push(d === 0 ? '오늘 마감돼요.' : `마감까지 ${d}일 남았어요.`);
  if (life === 'UPCOMING') reasons.push('아직 접수 시작 전이에요.');
  return { score, level: (score >= 45 ? 'HIGH' : score >= 20 ? 'MID' : 'LOW') as 'HIGH' | 'MID' | 'LOW', reasons, life };
}

/** 데모 suAutoIndustry: 자격증 상태가 높은 것부터 업종 매핑 */
export function autoIndustry(certs: { certId: string; status: 'VERIFIED' | 'CLAIMED' | 'PREPARING' }[], overrides: Record<string, { industry: string; reason: string }>) {
  const rank = { VERIFIED: 3, CLAIMED: 2, PREPARING: 1 };
  const hits = certs.map((c) => ({ c, m: overrides[c.certId] ?? CERT_INDUSTRY_DEFAULT[c.certId] })).filter((x) => x.m).sort((a, b) => rank[b.c.status] - rank[a.c.status]);
  return hits[0] ? { certId: hits[0].c.certId, status: hits[0].c.status, industry: hits[0].m.industry, reason: hits[0].m.reason } : null;
}
