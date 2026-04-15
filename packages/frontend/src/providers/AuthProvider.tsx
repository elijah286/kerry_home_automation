'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { User, UserRole, Permission, AuthSessionResponse, UiPreferences, UiPreferenceLocks } from '@ha/shared';
import { ROLE_PERMISSIONS } from '@ha/shared';
import { getApiBase, isRemoteAccess } from '@/lib/api-base';
import { useSessionRefresh } from '@/hooks/useWebSocket';

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

// -- Remote access token management ------------------------------------------

const REMOTE_TOKEN_KEY = 'ha_remote_token';
const REMOTE_REFRESH_KEY = 'ha_remote_refresh';

function getRemoteToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REMOTE_TOKEN_KEY);
}

function setRemoteTokens(token: string, refresh: string): void {
  localStorage.setItem(REMOTE_TOKEN_KEY, token);
  localStorage.setItem(REMOTE_REFRESH_KEY, refresh);
}

function clearRemoteTokens(): void {
  localStorage.removeItem(REMOTE_TOKEN_KEY);
  localStorage.removeItem(REMOTE_REFRESH_KEY);
}

/** Build fetch options with proper auth for local (cookie) or remote (Bearer token) mode. */
export function authFetchOpts(extra?: RequestInit): RequestInit {
  const remote = typeof window !== 'undefined' && isRemoteAccess();
  const opts: RequestInit = { ...extra };
  if (remote) {
    const token = getRemoteToken();
    if (token) {
      opts.headers = {
        ...(opts.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${token}`,
      };
    }
  } else {
    opts.credentials = 'include';
  }
  return opts;
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
    const remote = typeof window !== 'undefined' && isRemoteAccess();
    if (remote) {
      // Remote mode — use /auth/me on the proxy with Bearer token
      const token = getRemoteToken();
      if (!token) return;
      const res = await fetch(`${api}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = (await res.json()) as { user: any };
      // Map proxy user response to AuthSessionResponse shape
      setUser({
        id: data.user.id,
        username: data.user.display_name || data.user.email,
        displayName: data.user.display_name,
        role: data.user.role,
        enabled: true,
        hasPin: false,
      } as User);
      return;
    }
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
    const remote = typeof window !== 'undefined' && isRemoteAccess();

    if (remote) {
      // Remote mode — check Supabase token from localStorage
      const token = getRemoteToken();
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }
      fetch(`${api}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => {
          if (!r.ok) throw new Error('Not authenticated');
          return r.json();
        })
        .then((data: { user: any }) => {
          setUser({
            id: data.user.id,
            username: data.user.display_name || data.user.email,
            displayName: data.user.display_name,
            role: data.user.role,
            enabled: true,
            hasPin: false,
          } as User);
        })
        .catch(() => {
          clearRemoteTokens();
          setUser(null);
        })
        .finally(() => setLoading(false));
      return;
    }

    // Local mode — check JWT cookie
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

  // Slow poll (30s) for kiosk/child sessions as a fallback in case
  // the WebSocket push is missed.
  useEffect(() => {
    if (!user || elevated) return;
    if (user.role !== 'kiosk' && user.role !== 'child') return;
    const id = window.setInterval(() => {
      void refreshSession();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [user, elevated, refreshSession]);

  // Instant refresh when admin changes this user's settings (appearance,
  // role, etc.) — pushed via WebSocket so kiosks update immediately.
  useSessionRefresh(user?.id, refreshSession);

  const login = useCallback(async (usernameOrEmail: string, password: string) => {
    const api = getApiBase();
    const remote = typeof window !== 'undefined' && isRemoteAccess();

    if (remote) {
      // Remote mode — authenticate via proxy's Supabase endpoint
      let res: Response;
      try {
        res = await fetch(`${api}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: usernameOrEmail, password }),
        });
      } catch (e) {
        if (isLikelyNetworkFailure(e)) {
          throw new Error('Cannot reach the remote proxy. Check your internet connection.');
        }
        throw e instanceof Error ? e : new Error(String(e));
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Login failed');
      }
      const data = (await res.json()) as {
        token: string;
        refresh_token: string;
        user: { id: string; email: string; display_name: string; role: string };
      };
      setRemoteTokens(data.token, data.refresh_token);
      setUser({
        id: data.user.id,
        username: data.user.display_name || data.user.email,
        displayName: data.user.display_name,
        role: data.user.role as UserRole,
        enabled: true,
        hasPin: false,
      } as User);
      return;
    }

    // Local mode — authenticate via backend JWT
    let res: Response;
    try {
      res = await fetch(`${api}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: usernameOrEmail, password }),
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
    const remote = typeof window !== 'undefined' && isRemoteAccess();
    if (remote) {
      const token = getRemoteToken();
      await fetch(`${api}/auth/logout`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).catch(() => {});
      clearRemoteTokens();
    } else {
      await fetch(`${api}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      }).catch(() => {});
    }
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
