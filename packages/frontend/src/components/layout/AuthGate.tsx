'use client';

import { type ReactNode, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { AppShell } from './AppShell';
import { Loader2 } from 'lucide-react';
import { FederationEmblem } from '@/components/lcars/FederationEmblem';

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { activeTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();

  const isLoginPage = pathname === '/login';
  const needsRedirect = !loading && !user && !isLoginPage;
  const isLCARS = activeTheme === 'lcars';

  useEffect(() => {
    if (needsRedirect) {
      router.replace('/login');
    }
  }, [needsRedirect, router]);

  // Show emblem (LCARS only) + spinner while checking auth
  if (loading) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-6 px-6"
        style={{ backgroundColor: 'var(--color-bg)' }}
      >
        {isLCARS && <FederationEmblem size={180} />}
        <Loader2 className="h-6 w-6 animate-spin shrink-0" style={{ color: 'var(--color-accent)' }} />
      </div>
    );
  }

  // Login page doesn't need AppShell
  if (isLoginPage) {
    return <>{children}</>;
  }

  // Waiting for redirect or not authenticated
  if (!user) {
    return null;
  }

  // Authenticated — render with AppShell
  return <AppShell>{children}</AppShell>;
}
