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
  if (process.env.NODE_ENV === 'development') {
    return `Cannot reach the API at ${api}. Start the backend (npm run dev) or set NEXT_PUBLIC_API_URL to the correct origin.`;
  }
  return `Cannot reach the hub at ${api}. The service may still be starting after an update or reboot. If this continues, check Docker or the server (SSH).`;
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
  /** True while PIN elevation is active for this session */
  elevated: boolean;
  /** Seconds remaining (from server; polled while elevated) */
  elevatedSecondsRemaining: number;
  hasPin: boolean;
  /** True when at least one admin/parent has a PIN set — any session can be elevated. */
  pinElevationAvailable: boolean;
  submitPin: (pin: string) => Promise<void>;
  setAccountPin: (password: string, pin: string) => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function applySessionToState(
  data: AuthSessionResponse,
  setUser: (u: User) => void,
  setUiPreferences: (p: UiPreferences) => void,
  setUiPreferenceLocks: (l: UiPreferenceLocks) => void,
  setElevated: (b: boolean) => void,
  setElevatedSecondsRemaining: (n: number) => void,
  setPinElevationAvailable: (b: boolean) => void,
) {
  setUser(data.user);
  setUiPreferences(data.uiPreferences ?? {});
  setUiPreferenceLocks(data.uiPreferenceLocks ?? {});
  setElevated(data.elevated ?? false);
  setElevatedSecondsRemaining(data.elevatedSecondsRemaining ?? 0);
  setPinElevationAvailable(data.pinElevationAvailable ?? false);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [uiPreferences, setUiPreferences] = useState<UiPreferences>({});
  const [uiPreferenceLocks, setUiPreferenceLocks] = useState<UiPreferenceLocks>({});
  const [elevated, setElevated] = useState(false);
  const [elevatedSecondsRemaining, setElevatedSecondsRemaining] = useState(0);
  const [pinElevationAvailable, setPinElevationAvailable] = useState(false);

  const refreshSession = useCallback(async () => {
    const api = getApiBase();
    const res = await fetch(`${api}/api/auth/me`, { credentials: 'include' });
    if (!res.ok) return;
    const data = (await res.json()) as AuthSessionResponse;
    applySessionToState(
      data,
      setUser,
      setUiPreferences,
      setUiPreferenceLocks,
      setElevated,
      setElevatedSecondsRemaining,
      setPinElevationAvailable,
    );
  }, []);

  // Check existing session on mount, then load role permissions
  useEffect(() => {
    const api = getApiBase();
    fetch(`${api}/api/auth/me`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error('Not authenticated');
        return r.json();
      })
      .then((data: AuthSessionResponse) => {
        applySessionToState(
          data,
          setUser,
          setUiPreferences,
          setUiPreferenceLocks,
          setElevated,
          setElevatedSecondsRemaining,
          setPinElevationAvailable,
        );
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
        setElevated(false);
        setElevatedSecondsRemaining(0);
      })
      .finally(() => setLoading(false));
  }, []);

  // Fast poll (1s) during PIN elevation to count down the timer
  useEffect(() => {
    if (!user || !elevated) return;
    const id = window.setInterval(() => {
      void refreshSession();
    }, 1000);
    return () => window.clearInterval(id);
  }, [user, elevated, refreshSession]);

  // Slow poll (30s) for kiosk/child sessions so admin appearance
  // changes (theme, magnification, etc.) propagate without a refresh.
  useEffect(() => {
    if (!user || elevated) return;
    if (user.role !== 'kiosk' && user.role !== 'child') return;
    const id = window.setInterval(() => {
      void refreshSession();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [user, elevated, refreshSession]);

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
    applySessionToState(
      data,
      setUser,
      setUiPreferences,
      setUiPreferenceLocks,
      setElevated,
      setElevatedSecondsRemaining,
      setPinElevationAvailable,
    );
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
    setElevated(false);
    setElevatedSecondsRemaining(0);
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
    applySessionToState(
      data,
      setUser,
      setUiPreferences,
      setUiPreferenceLocks,
      setElevated,
      setElevatedSecondsRemaining,
      setPinElevationAvailable,
    );
  }, []);

  const submitPin = useCallback(async (pin: string) => {
    const api = getApiBase();
    const res = await fetch(`${api}/api/auth/pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ pin }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error ?? 'PIN verification failed');
    }
    const data = (await res.json()) as AuthSessionResponse;
    applySessionToState(
      data,
      setUser,
      setUiPreferences,
      setUiPreferenceLocks,
      setElevated,
      setElevatedSecondsRemaining,
      setPinElevationAvailable,
    );
  }, []);

  const setAccountPin = useCallback(async (password: string, pin: string) => {
    const api = getApiBase();
    const res = await fetch(`${api}/api/auth/me/pin`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ password, pin }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error ?? 'Could not save PIN');
    }
    const data = (await res.json()) as AuthSessionResponse;
    applySessionToState(
      data,
      setUser,
      setUiPreferences,
      setUiPreferenceLocks,
      setElevated,
      setElevatedSecondsRemaining,
      setPinElevationAvailable,
    );
  }, []);

  const hasPin = Boolean(user?.hasPin);

  const isAdmin = user?.role === 'admin' || elevated;

  const hasPermission = useCallback(
    (permission: Permission) => {
      if (!user) return false;
      if (elevated) return true;
      return ROLE_PERMISSIONS[user.role]?.includes(permission) ?? false;
    },
    [user, elevated],
  );

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
        elevated,
        elevatedSecondsRemaining,
        hasPin,
        pinElevationAvailable,
        submitPin,
        setAccountPin,
        refreshSession,
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
