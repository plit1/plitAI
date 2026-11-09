'use client';
import Link from 'next/link';
import { Badge, LIFE, MATCH } from './ui';

export interface Job {
  id: string; isDemo: boolean; companyName: string; title: string; workLocation: string; region: string; employmentType: string; experienceLabel: string; education: string | null; salary: string | null;
  requiredCerts: { id: string; name: string }[]; preferredCerts: { id: string; name: string }[]; categories: string[]; expiresAt: string | null; life: string; originalUrl: string | null; fetchedAt: string;
  match?: { score: number; level: string; reasons: string[] }; saved?: boolean;
}
const dl = (iso: string | null) => (iso ? `~${new Date(iso).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}` : '상시');

export function JobCard({ j }: { j: Job }) {
  return (
    <li><Link href={`/jobs/${j.id}`} className="card block space-y-1 p-4 hover:shadow-md" data-testid="job-card">
      <div className="flex flex-wrap gap-1">
        <Badge tone={LIFE[j.life]?.[1] ?? 'mute'}>{LIFE[j.life]?.[0] ?? j.life}</Badge>
        {j.match && <Badge tone={MATCH[j.match.level][1]}>{MATCH[j.match.level][0]}</Badge>}
        {j.isDemo && <Badge tone="mute">데모</Badge>}
        {j.saved && <Badge tone="gold">관심</Badge>}
      </div>
      <p className="font-bold">{j.title}</p>
      <p className="text-xs text-ink-soft">{j.companyName} · {j.workLocation} · {j.employmentType} · {j.experienceLabel} · {dl(j.expiresAt)}</p>
      {j.requiredCerts.length + j.preferredCerts.length > 0 && <p className="text-xs text-ink-mute">{j.requiredCerts.map((c) => `필수 ${c.name}`).concat(j.preferredCerts.map((c) => `우대 ${c.name}`)).join(' · ')}</p>}
      {j.match?.reasons[0] && <p className="text-xs text-cobalt">{j.match.reasons[0]}</p>}
    </Link></li>
  );
}
export const JobsNav = () => (
  <nav aria-label="취업하기 메뉴" className="flex flex-wrap gap-3 text-sm font-semibold">
    <Link href="/jobs" className="text-cobalt">공고 찾기</Link><Link href="/jobs/saved" className="text-ink-soft">관심 공고</Link><Link href="/jobs/settings" className="text-ink-soft">맞춤 조건</Link>
  </nav>
);
export const JOBS_NOTICE = 'PLIT 은 공고 정보를 모아 보여줄 뿐 채용을 중개하지 않아요. 지원 전 원문 공고에서 조건을 꼭 확인하세요.';
