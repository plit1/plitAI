'use client';
import Link from 'next/link';
import { Badge, LIFE, MATCH } from './ui';

export interface Meta {
  industries: { code: string; name: string; chip: string; checks: string[] }[]; stages: Record<string, { label: string }>; supportTypes: Record<string, { label: string; desc: string }>;
  sido: string[]; budgets: string[]; roadmap: { id: string; title: string; desc: string; path: string | null }[];
  funds: { sido: string; name: string; url: string }[]; market: { id: string; name: string; url: string; status: string; note: string }[];
  partners: { id: string; category: string; categoryLabel: string; name: string; headline: string; regions: string[]; desc: string; isDemo: boolean }[]; notice: string;
}
export interface Program {
  id: string; isDemo: boolean; title: string; agency: string; region: string; sigungu: string | null; targetStages: string[]; industries: string[];
  supportType: string; supportTypeLabel: string; applyStart: string | null; applyEnd: string | null; daysLeft: number | null; life: string; sourceUrl: string | null;
  match?: { score: number; level: string; reasons: string[] }; saved?: boolean;
}
const d = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : '');

export function ProgramCard({ p }: { p: Program }) {
  return (
    <li><Link href={`/startup/programs/${p.id}`} className="card block space-y-1 p-4 hover:shadow-md" data-testid="program-card">
      <div className="flex flex-wrap gap-1">
        <Badge tone={LIFE[p.life]?.[1] ?? 'mute'}>{LIFE[p.life]?.[0] ?? p.life}{p.life === 'CLOSING_SOON' && p.daysLeft !== null ? ` D-${p.daysLeft}` : ''}</Badge>
        <Badge tone="mute">{p.supportTypeLabel}</Badge>
        {p.match && <Badge tone={MATCH[p.match.level][1]}>{MATCH[p.match.level][0]}</Badge>}
        {p.isDemo && <Badge tone="mute">데모</Badge>}{p.saved && <Badge tone="gold">관심</Badge>}
      </div>
      <p className="font-bold">{p.title}</p>
      <p className="text-xs text-ink-soft">{p.agency} · {p.region}{p.sigungu ? ` ${p.sigungu}` : ''} · {p.applyStart || p.applyEnd ? `${d(p.applyStart)}~${d(p.applyEnd)}` : '상시'}</p>
      {p.match?.reasons[0] && <p className="text-xs text-cobalt">{p.match.reasons[0]}</p>}
    </Link></li>
  );
}
export const StartupNav = () => (
  <nav aria-label="창업하기 메뉴" className="flex flex-wrap gap-3 text-sm font-semibold">
    {[['/startup', '창업 홈'], ['/startup/roadmap', '로드맵'], ['/startup/programs', '지원사업'], ['/startup/funds', '자금·보증'], ['/startup/market', '상권 정보'], ['/startup/partners', '파트너']].map(([h, l]) => <Link key={h} href={h} className="text-ink-soft hover:text-cobalt">{l}</Link>)}
  </nav>
);
