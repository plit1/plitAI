/**
 * 취업하기 매칭 규칙 (데모 v2.9 JB_MATCHER rules-v1 이관) — 순수 함수.
 * 점수는 정보 추천용이며 지원 자격·법정 선임 요건 충족을 보증하지 않는다.
 */
import data from '../../data/demo-jobs-startup.json';

export const JOB_MAP_DEFAULT: Record<string, string[]> = data.JB_MAP_DEFAULT;
export const FIELD_FALLBACK: Record<string, string[]> = data.JB_FIELD_FALLBACK;
export const REGIONS: string[] = data.JB_REGIONS;
export const EMPLOYMENT: string[] = data.JB_EMP;
export const EXPERIENCE: Record<string, string> = data.JB_EXP;

export type CertStatus = 'VERIFIED' | 'CLAIMED' | 'PREPARING';
export interface MyCert { certId: string; name: string; status: CertStatus }
export interface JobLike {
  id: string; title: string; companyName: string; description: string; workLocation: string; region: string;
  employmentType: string; experience: string; requiredCerts: string[]; preferredCerts: string[]; categories: string[]; expiresAt: Date | null;
}
export interface JobProfileLike { regions: string[]; roles: string[]; experience: string | null; employment: string[] }

const DAY = 86400000;
/** KST 달력일 기준 남은 일수 */
export function daysLeft(expiresAt: Date | null, now: Date) {
  if (!expiresAt) return null;
  const k = (d: Date) => Date.parse(new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10));
  return Math.round((k(expiresAt) - k(now)) / DAY);
}
/** 데모 jbLifecycle */
export function lifecycle(job: { expiresAt: Date | null; status?: string }, now: Date) {
  if (job.status === 'ARCHIVED') return 'ARCHIVED';
  const d = daysLeft(job.expiresAt, now);
  return d === null ? 'ACTIVE' : d < 0 ? 'EXPIRED' : d <= 3 ? 'CLOSING_SOON' : 'ACTIVE';
}

/** 자격증 → 추천 직무 키워드 (관리자 수정 > 기본 맵 > 분야 대체) */
export function keywordsFor(certId: string, field: string | undefined, overrides: Record<string, string[]>) {
  return overrides[certId] ?? JOB_MAP_DEFAULT[certId] ?? (field ? FIELD_FALLBACK[field] ?? [] : []);
}

export function matchJob(job: JobLike, ctx: { certs: MyCert[]; profile: JobProfileLike; keywords: (certId: string) => string[]; now: Date }) {
  const { certs, profile, now } = ctx;
  const reasons: string[] = [];
  const life = lifecycle(job, now);
  if (life === 'EXPIRED' || life === 'ARCHIVED') return { score: -1, level: 'CLOSED' as const, reasons: ['모집이 마감된 공고예요.'], life };
  let score = 0;
  let certHit: { certId: string; name: string; kind: 'required' | 'preferred'; status: CertStatus } | null = null;
  for (const c of certs) {
    const owned = c.status !== 'PREPARING';
    if (job.requiredCerts.includes(c.certId)) { const s = owned ? 45 : 26; if (s > score) { score = s; certHit = { certId: c.certId, name: c.name, kind: 'required', status: c.status }; } }
    else if (job.preferredCerts.includes(c.certId)) { const s = owned ? 34 : 20; if (s > score) { score = s; certHit = { certId: c.certId, name: c.name, kind: 'preferred', status: c.status }; } }
  }
  if (certHit) {
    const cond = certHit.kind === 'required' ? '필수조건' : '우대조건';
    reasons.push(certHit.status === 'PREPARING' ? `준비 중인 ${certHit.name} 자격증이 ${cond}에 포함되어 있어요. 취득 후 지원을 고려해 보세요.` : `${certHit.name} 자격증이 ${cond}에 포함되어 추천했습니다.`);
  }
  let rel: { certId: string; name: string; kw: string } | null = null;
  for (const c of certs) {
    const hit = ctx.keywords(c.certId).find((w) => job.categories.includes(w) || job.title.includes(w));
    if (hit) { rel = { certId: c.certId, name: c.name, kw: hit }; break; }
  }
  if (rel) { score += 18; reasons.push(!certHit || certHit.certId !== rel.certId ? `${rel.name}과 관련된 「${rel.kw}」 직무예요.` : `「${rel.kw}」 직무로 자격증 활용도가 높아요.`); }
  const roleHit = profile.roles.find((w) => job.categories.includes(w) || job.title.includes(w));
  if (roleHit) { score += 8; if (!rel || rel.kw !== roleHit) reasons.push(`희망 직무 「${roleHit}」와 일치해요.`); }
  if (profile.regions.length) {
    if (profile.regions.includes(job.region)) { score += 14; reasons.push(`희망 근무지역(${job.region})과 일치해요.`); } else score -= 8;
  }
  if (job.experience === 'ANY' || !profile.experience || profile.experience === 'ANY' || job.experience === profile.experience) {
    score += 7;
    if (profile.experience === 'NEW' && job.experience !== 'EXP') reasons.push(job.experience === 'NEW' ? '신입 지원이 가능한 공고예요.' : '경력무관 공고라 신입도 지원할 수 있어요.');
  } else score -= 10;
  if (!profile.employment.length || profile.employment.includes(job.employmentType)) score += 4;
  const d = daysLeft(job.expiresAt, now);
  if (life === 'CLOSING_SOON') reasons.push(d === 0 ? '오늘 마감되는 공고예요.' : `마감까지 ${d}일 남았어요.`);
  const level = certHit && score >= 50 ? 'HIGH' : score >= 28 ? 'MID' : 'LOW';
  return { score, level: level as 'HIGH' | 'MID' | 'LOW', reasons, life, certHit };
}

/** 데모 jbSearchHit: 제목·회사·설명·근무지·직무 + 자격증 이름 */
export function searchHit(job: JobLike, q: string, certName: (id: string) => string | undefined, certByName: (q: string) => string | undefined, keywords: (certId: string) => string[]) {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const ids = [...job.requiredCerts, ...job.preferredCerts];
  const hay = [job.title, job.companyName, job.description, job.workLocation, ...job.categories, ...ids.map((i) => certName(i) ?? '')].join(' ').toLowerCase();
  if (hay.includes(s)) return true;
  const cert = certByName(s);
  return !!cert && (ids.includes(cert) || keywords(cert).some((w) => job.categories.includes(w)));
}
