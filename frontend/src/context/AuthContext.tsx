import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AuthUser } from '../services/authService';
import { getStoredToken, login, me, logout, register, setStoredToken } from '../services/authService';

type AuthState = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  refreshMe: () => Promise<void>;
  doLogin: (username: string, password: string) => Promise<void>;
  doRegister: (username: string, password: string) => Promise<void>;
  doLogout: () => Promise<void>;
  canAccess: (path: string) => boolean;
  firstAllowedPath: () => string;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshMe = useCallback(async () => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const res = await me(token);
      setUser(res.data.user);
    } catch {
      setStoredToken(null);
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  const doLogin = useCallback(async (username: string, password: string) => {
    setLoading(true);
    const res = await login(username, password);
    setStoredToken(res.data.token);
    setToken(res.data.token);
    setUser(res.data.user);
    setLoading(false);
  }, []);

  const doRegister = useCallback(async (username: string, password: string) => {
    setLoading(true);
    const res = await register(username, password);
    setStoredToken(res.data.token);
    setToken(res.data.token);
    setUser(res.data.user);
    setLoading(false);
  }, []);

  const doLogout = useCallback(async () => {
    if (!token) {
      setStoredToken(null);
      setToken(null);
      setUser(null);
      return;
    }

    try {
      await logout(token);
    } finally {
      setStoredToken(null);
      setToken(null);
      setUser(null);
    }
  }, [token]);

  const canAccess = useCallback((path: string) => {
    if (!user) return false;
    if (user.isAdmin) return true;
    if (path === '/user-management') return false;
    return (user.permissions || []).includes(path);
  }, [user]);

  const firstAllowedPath = useCallback(() => {
    if (!user) return '/login';
    if (user.isAdmin) return '/super-main-force';
    const permissions = user.permissions || [];
    const preferred = [
      '/super-main-force',
      '/smart-selection',
      '/stocks',
      '/settings',
    ];
    for (const p of preferred) {
      if (permissions.includes(p)) return p;
    }
    return permissions[0] || '/forbidden';
  }, [user]);

  const value = useMemo<AuthState>(() => ({
    user,
    token,
    loading,
    refreshMe,
    doLogin,
    doRegister,
    doLogout,
    canAccess,
    firstAllowedPath,
  }), [user, token, loading, refreshMe, doLogin, doRegister, doLogout, canAccess, firstAllowedPath]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('AuthContext missing');
  }
  return ctx;
}
