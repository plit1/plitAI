/** PLIT API 클라이언트. access 토큰은 메모리에만 보관(XSS 노출 최소화), refresh 는 httpOnly 쿠키. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
const listeners = new Set<() => void>();
export const onAuthChange = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
export const setAccessToken = (t: string | null) => { accessToken = t; listeners.forEach((f) => f()); };
export const hasToken = () => !!accessToken;

export async function refresh(): Promise<boolean> {
  refreshing ??= fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'same-origin' })
    .then(async (r) => { if (!r.ok) { setAccessToken(null); return false; } setAccessToken((await r.json()).accessToken); return true; })
    .catch(() => false)
    .finally(() => { refreshing = null; });
  return refreshing;
}

export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}, retried = false): Promise<T> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  let body = init.body;
  if (init.json !== undefined) { headers.set('Content-Type', 'application/json'); body = JSON.stringify(init.json); }
  const res = await fetch(`/api/v1${path}`, { ...init, headers, body, credentials: 'same-origin' });
  if (res.status === 401 && !retried && !path.startsWith('/auth/')) {
    if (await refresh()) return api<T>(path, init, true);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.code ?? 'ERROR', data.message ?? '요청을 처리하지 못했어요.', data.details);
  return data as T;
}

export const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
export const pts = (n: number) => `${n.toLocaleString('ko-KR')}P`;
export const dday = (n: number) => (n > 0 ? `D-${n}` : n === 0 ? 'D-DAY' : `D+${-n}`);
