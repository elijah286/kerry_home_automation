'use client';

import { type ReactNode, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import { AppShell } from './AppShell';
import { Loader2 } from 'lucide-react';

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

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-bg)' }}>
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--color-accent)' }} />
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
