import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type AuthUser = {
  id: string;
  email: string;
  status: string;
};

type AuthEmployee = {
  id: string;
  name: string;
  roles: string[];
};

type EmployeeProfile = {
  id: string;
  employeeId: string;
  primaryRole: string;
  profitSharePercent: number;
  hourlyRate: number | null;
  exceptions: Record<string, any>;
};

export type MePayload = {
  tenantId: string;
  user: AuthUser;
  employee: AuthEmployee | null;
  profile: EmployeeProfile | null;
};

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type AuthContextValue = {
  status: AuthStatus;
  me: MePayload | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json();
  if (!response.ok || payload?.success === false) {
    const error = payload?.error ?? 'Prišlo je do napake';
    throw new Error(error);
  }
  return payload?.data as T;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [me, setMe] = useState<MePayload | null>(null);

  const refreshMe = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me', { credentials: 'include' });
      if (response.status === 401) {
        setStatus('unauthenticated');
        setMe(null);
        return;
      }
      const data = await parseResponse<MePayload>(response);
      setMe(data);
      setStatus('authenticated');
    } catch {
      setStatus('unauthenticated');
      setMe(null);
    }
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      await parseResponse(response);
      await refreshMe();
    },
    [refreshMe]
  );

  const logout = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      await parseResponse(response);
    } catch {
      // ignore
    }
    setMe(null);
    setStatus('unauthenticated');
  }, []);

  const value = useMemo(
    () => ({
      status,
      me,
      login,
      logout,
      refreshMe,
    }),
    [status, me, login, logout, refreshMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
