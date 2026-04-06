"use client";

import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "@/providers/AuthProvider";
import { WebSocketProvider } from "@/providers/WebSocketProvider";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { AppShell } from "@/components/layout/AppShell";
import { usePathname } from "next/navigation";

function AuthGate({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();

  const isPublicRoute = pathname === "/login" || pathname.startsWith("/kiosk");

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-accent" />
      </div>
    );
  }

  if (!user && !isPublicRoute) {
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    return null;
  }

  if (isPublicRoute && !user) {
    return <>{children}</>;
  }

  return (
    <WebSocketProvider>
      <ThemeProvider>
        <AppShell>{children}</AppShell>
      </ThemeProvider>
    </WebSocketProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AuthGate>{children}</AuthGate>
    </AuthProvider>
  );
}
