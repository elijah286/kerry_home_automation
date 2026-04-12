'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { User, UserRole, Permission, AuthSessionResponse, UiPreferences, UiPreferenceLocks } from '@ha/shared';
import { ROLE_PERMISSIONS } from '@ha/shared';
import { getApiBase } from '@/lib/api-base';

function isLikelyNetworkFailure(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  if (e instanceof Error) {
    return /failed to fetch|load failed|networkerror|network request failed/i.test(e.message);
  }
  return false;
}

function apiReachabilityHint(api: string): string {
  return `Cannot reach the API at ${api}. Start the backend (npm run dev) or set NEXT_PUBLIC_API_URL to the correct origin.`;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  hasPermission: (permission: Permission) => boolean;
  uiPreferences: UiPreferences;
  uiPreferenceLocks: UiPreferenceLocks;
  patchUiPreferences: (patch: UiPreferences) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function applySessionToState(
  data: AuthSessionResponse,
  setUser: (u: User) => void,
  setUiPreferences: (p: UiPreferences) => void,
  setUiPreferenceLocks: (l: UiPreferenceLocks) => void,
) {
  setUser(data.user);
  setUiPreferences(data.uiPreferences ?? {});
  setUiPreferenceLocks(data.uiPreferenceLocks ?? {});
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [uiPreferences, setUiPreferences] = useState<UiPreferences>({});
  const [uiPreferenceLocks, setUiPreferenceLocks] = useState<UiPreferenceLocks>({});

  // Check existing session on mount, then load role permissions
  useEffect(() => {
    const api = getApiBase();
    fetch(`${api}/api/auth/me`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error('Not authenticated');
        return r.json();
      })
      .then((data: AuthSessionResponse) => {
        applySessionToState(data, setUser, setUiPreferences, setUiPreferenceLocks);
        return fetch(`${api}/api/role-permissions`, { credentials: 'include' })
          .then((r) => (r.ok ? r.json() : null))
          .then((permData: { roles: Record<string, Permission[]> } | null) => {
            if (permData?.roles) {
              for (const [role, perms] of Object.entries(permData.roles)) {
                ROLE_PERMISSIONS[role as UserRole] = perms;
              }
            }
          })
          .catch(() => {});
      })
      .catch(() => {
        setUser(null);
        setUiPreferences({});
        setUiPreferenceLocks({});
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const api = getApiBase();
    let res: Response;
    try {
      res = await fetch(`${api}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });
    } catch (e) {
      if (isLikelyNetworkFailure(e)) {
        throw new Error(apiReachabilityHint(api));
      }
      throw e instanceof Error ? e : new Error(String(e));
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error ?? 'Login failed');
    }
    const data = (await res.json()) as AuthSessionResponse;
    applySessionToState(data, setUser, setUiPreferences, setUiPreferenceLocks);
  }, []);

  const logout = useCallback(async () => {
    const api = getApiBase();
    await fetch(`${api}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {});
    setUser(null);
    setUiPreferences({});
    setUiPreferenceLocks({});
  }, []);

  const patchUiPreferences = useCallback(async (patch: UiPreferences) => {
    const api = getApiBase();
    const res = await fetch(`${api}/api/auth/me/ui-preferences`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(patch),
    });
    if (!res.ok) return;
    const data = (await res.json()) as AuthSessionResponse;
    setUser(data.user);
    setUiPreferences(data.uiPreferences ?? {});
    setUiPreferenceLocks(data.uiPreferenceLocks ?? {});
  }, []);

  const isAdmin = user?.role === 'admin';

  const hasPermission = useCallback((permission: Permission) => {
    if (!user) return false;
    return ROLE_PERMISSIONS[user.role]?.includes(permission) ?? false;
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        isAdmin,
        hasPermission,
        uiPreferences,
        uiPreferenceLocks,
        patchUiPreferences,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
