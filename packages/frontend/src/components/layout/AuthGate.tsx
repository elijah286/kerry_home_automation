'use client';

import { type ReactNode, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import { AppShell } from './AppShell';
import { Loader2 } from 'lucide-react';
import { UfpEmblemLogo } from '@/components/ui/UfpEmblemLogo';

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isLoginPage = pathname === '/login';
  const needsRedirect = !loading && !user && !isLoginPage;

  useEffect(() => {
    if (needsRedirect) {
      router.replace('/login');
    }
  }, [needsRedirect, router]);

  // Show emblem + spinner while checking auth
  if (loading) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-6 px-6"
        style={{ backgroundColor: 'var(--color-bg)' }}
      >
        <div className="w-full max-w-[min(320px,90vw)]">
          <UfpEmblemLogo maxWidth={1024} priority />
        </div>
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
