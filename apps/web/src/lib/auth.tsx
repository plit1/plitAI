'use client';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, onAuthChange, refresh, setAccessToken, hasToken } from './api';

export interface Me { id: string; email: string | null; nickname: string; role: 'USER' | 'OPERATOR' | 'SUPER_ADMIN'; points: number; referralCode: string; activeEnrollments: number; activePasses: number; providers: string[]; passwordChangeRequired?: boolean; mfaEnabled?: boolean }
interface Ctx { me: Me | null; ready: boolean; reload: () => Promise<void>; logout: () => Promise<void>; setSession: (token: string) => Promise<void> }
const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const reload = useCallback(async () => { setMe(hasToken() ? await api<Me>('/me').catch(() => null) : null); }, []);

  useEffect(() => { refresh().then(reload).finally(() => setReady(true)); }, [reload]);
  useEffect(() => onAuthChange(() => { if (!hasToken()) setMe(null); }), []);

  const setSession = useCallback(async (token: string) => { setAccessToken(token); await reload(); }, [reload]);
  const logout = useCallback(async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); setAccessToken(null); setMe(null); }, []);

  return <AuthCtx.Provider value={{ me, ready, reload, logout, setSession }}><PasswordGate me={me} />{children}</AuthCtx.Provider>;
}

/** 임시 비밀번호 계정(최초 관리자 등)은 비밀번호를 바꿀 때까지 변경 화면으로 보낸다 (서버도 403 으로 강제) */
function PasswordGate({ me }: { me: Me | null }) {
  const path = usePathname(); const router = useRouter();
  useEffect(() => { if (me?.passwordChangeRequired && path !== '/my/password') router.replace('/my/password'); }, [me, path, router]);
  return null;
}

export const useAuth = () => { const c = useContext(AuthCtx); if (!c) throw new Error('AuthProvider 필요'); return c; };
