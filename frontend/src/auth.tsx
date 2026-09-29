import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { client, refreshAccessToken, tokenStore } from './api';
import type { User } from './types';

type Auth = { user: User | null; ready: boolean; offline: boolean; sessionReason: string | null; lastRole: User['role'] | null; login: (email: string, password: string) => Promise<{ mustChangePassword: boolean; role: User['role'] }>; establishSession: () => Promise<void>; logout: (remote?: boolean) => Promise<void>; refresh: () => Promise<void> };
const AuthContext = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null); const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false); const [sessionReason, setSessionReason] = useState<string | null>(null);
  const [lastRole, setLastRole] = useState<User['role'] | null>(() => localStorage.getItem('rxflow:last-role') as User['role'] | null);
  const rememberRole = (role: User['role']) => { localStorage.setItem('rxflow:last-role', role); setLastRole(role); };
  const establishSession = async () => { const me = await client.get('/auth/me'); const activeUser = me.data.data.user as User; setUser(activeUser); rememberRole(activeUser.role); setOffline(false); };
  const refresh = async () => { await refreshAccessToken(); await establishSession(); setSessionReason(null); };
  useEffect(() => { refresh().catch((error) => { tokenStore.clear(); if (!(error as { response?: unknown }).response) setOffline(true); }).finally(() => setReady(true)); }, []);
  useEffect(() => {
    const expireSession = (event: Event) => { tokenStore.clear(); setUser(null); setSessionReason((event as CustomEvent<{ code?: string }>).detail?.code ?? 'SESSION_EXPIRED'); setOffline(false); setReady(true); };
    window.addEventListener('rxflow:session-expired', expireSession);
    return () => window.removeEventListener('rxflow:session-expired', expireSession);
  }, []);
  const login = async (email: string, password: string) => { const { data } = await client.post('/auth/login', { email: email.trim(), password }); tokenStore.set(data.data.accessToken); await establishSession(); setSessionReason(null); const role = data.data.role as User['role']; rememberRole(role); return { mustChangePassword: Boolean(data.data.mustChangePassword), role }; };
  const logout = async (remote = true) => { try { if (remote) await client.post('/auth/logout'); } catch { /* Session may already be invalidated. */ } finally { tokenStore.clear(); setUser(null); } };
  return <AuthContext.Provider value={{ user, ready, offline, sessionReason, lastRole, login, establishSession, logout, refresh }}>{children}</AuthContext.Provider>;
}
export function useAuth() { const context = useContext(AuthContext); if (!context) throw new Error('AuthProvider missing'); return context; }
