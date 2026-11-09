import type { MetadataRoute } from 'next';
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', allow: '/', disallow: ['/my', '/dashboard', '/checkout', '/admin', '/api'] }], sitemap: 'https://plit.ai.kr/sitemap.xml' };
}
