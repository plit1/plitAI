import Link from 'next/link';
export default function NotFound() {
  return <div className="card p-10 text-center"><p className="font-display text-4xl font-black text-cobalt">404</p><p className="mt-2 text-sm text-ink-soft">페이지를 찾을 수 없어요.</p><Link href="/" className="btn-primary mt-4">홈으로</Link></div>;
}
