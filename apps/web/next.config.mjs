/** API 를 같은 오리진(/api)으로 프록시 → refresh 쿠키 SameSite=Strict 유지, CORS 불필요 */
const API = process.env.API_ORIGIN || 'http://localhost:4000';
export default {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() { return [{ source: '/api/:path*', destination: `${API}/api/:path*` }]; },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Frame-Options', value: 'DENY' }, { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    ] }];
  },
};
