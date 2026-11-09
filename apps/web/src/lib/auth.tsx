'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, onAuthChange, refresh, setAccessToken, hasToken } from './api';

export interface Me { id: string; email: string | null; nickname: string; role: 'USER' | 'OPERATOR' | 'SUPER_ADMIN'; points: number; referralCode: string; activeEnrollments: number; activePasses: number; providers: string[] }
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

  return <AuthCtx.Provider value={{ me, ready, reload, logout, setSession }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => { const c = useContext(AuthCtx); if (!c) throw new Error('AuthProvider 필요'); return c; };
