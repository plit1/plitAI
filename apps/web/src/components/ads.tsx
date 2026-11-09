'use client';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { adEvent } from '@/lib/ads';
import { Badge } from './ui';

export interface AdCampaign { id: string; category: string; categoryLabel: string; advertiserName: string; title: string; description: string; detail: string[]; ctaText: string; topics: string[]; collectsContact: boolean; isDemo: boolean; disclosure: string }

/** 피드 광고 카드: 화면에 절반 이상 보이면 노출 1회 기록, 누르면 클릭 기록 후 상세로 */
export function AdCard({ c, placement }: { c: AdCampaign; placement: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { adEvent(c.id, 'IMPRESSION', placement); io.disconnect(); } }, { threshold: 0.5 });
    io.observe(el); return () => io.disconnect();
  }, [c.id, placement]);
  return (
    <li>
      <Link ref={ref} href={`/ads/${c.id}?p=${placement}`} onClick={() => adEvent(c.id, 'CLICK', placement)} className="card flex h-full flex-col gap-1 border-gold/40 p-4 hover:shadow-md" data-testid="ad-card">
        <div className="flex flex-wrap gap-1"><Badge tone="gold">광고</Badge><Badge tone="mute">{c.categoryLabel}</Badge>{c.isDemo && <Badge tone="mute">예시 광고주</Badge>}</div>
        <p className="mt-1 font-bold">{c.title}</p>
        <p className="line-clamp-2 text-sm text-ink-soft">{c.description}</p>
        <p className="text-xs text-ink-mute">{c.advertiserName}</p>
        <span className="mt-auto pt-2 text-sm font-bold text-cobalt">{c.ctaText} →</span>
      </Link>
    </li>
  );
}

/** 카드 every 장마다 광고 1개, 같은 광고 연속 금지 (서버 규칙과 동일) */
export function withAds<T>(items: T[], campaigns: AdCampaign[], every: number) {
  const out: ({ kind: 'item'; item: T } | { kind: 'ad'; c: AdCampaign; placement: string })[] = [];
  let i = 0, last: string | null = null;
  items.forEach((it, idx) => {
    out.push({ kind: 'item', item: it });
    if ((idx + 1) % every === 0 && campaigns.length) {
      const c = campaigns[i % campaigns.length];
      if (c.id !== last) { out.push({ kind: 'ad', c, placement: `finder-${i}` }); last = c.id; }
      i++;
    }
  });
  return out;
}
