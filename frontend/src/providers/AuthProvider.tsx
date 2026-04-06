"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@/types";

const TOKEN_KEY = "ha_auth_token";
const COOKIE_NAME = "ha_auth_active";

function setSyncCookie(active: boolean) {
  if (typeof document === "undefined") return;
  if (active) {
    document.cookie = `${COOKIE_NAME}=1;path=/;max-age=${60 * 60 * 24 * 30};samesite=lax`;
  } else {
    document.cookie = `${COOKIE_NAME}=;path=/;max-age=0`;
  }
}

export interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Validate stored token on mount
  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) {
      setIsLoading(false);
      return;
    }
    fetch(`${BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${stored}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("invalid token");
        const data = (await res.json()) as { user: User | null };
        if (data.user) {
          setUser(data.user);
          setToken(stored);
          setSyncCookie(true);
        } else {
          localStorage.removeItem(TOKEN_KEY);
          setSyncCookie(false);
        }
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setSyncCookie(false);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(body.error ?? "Login failed");
    }
    const data = (await res.json()) as { token: string; user: User };
    localStorage.setItem(TOKEN_KEY, data.token);
    setSyncCookie(true);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setSyncCookie(false);
    setToken(null);
    setUser(null);
    window.location.href = "/login";
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, token, isLoading, login, logout }),
    [user, token, isLoading, login, logout],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
