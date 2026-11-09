import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { Header } from '@/components/ui';

export const metadata: Metadata = {
  metadataBase: new URL('https://plit.ai.kr'),
  title: { default: 'PLIT 플릿 · 자격증 취득부터 취업까지', template: '%s · PLIT' },
  description: '자격증 챌린지에 참여하고 AI 학습관리로 합격하세요. 합격 인증 보상부터 취업·창업 연계까지.',
  openGraph: { siteName: 'PLIT', locale: 'ko_KR', type: 'website' },
};
export const viewport: Viewport = { themeColor: '#2443F5', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,600..900&family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=Noto+Sans+KR:wght@800;900&display=swap" rel="stylesheet" />
      </head>
      <body>
        <AuthProvider>
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:rounded focus:bg-surface focus:p-2">본문 바로가기</a>
          <Header />
          <main id="main" className="mx-auto max-w-5xl px-4 pb-24 pt-6">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
