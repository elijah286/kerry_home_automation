import type { Metadata } from 'next';
import { Antonio } from 'next/font/google';
import './globals.css';

const antonio = Antonio({
  subsets: ['latin'],
  variable: '--font-antonio',
  display: 'swap',
});
import { ThemeProvider } from '@/providers/ThemeProvider';
import { CapabilitiesProvider } from '@/providers/CapabilitiesProvider';
import { AuthProvider } from '@/providers/AuthProvider';
import { AuthGate } from '@/components/layout/AuthGate';
import { AlertProvider } from '@/components/lcars/LCARSAlertOverlay';
import { LCARSSoundsProvider } from '@/components/lcars/LCARSSounds';
import { LCARSVariantProvider } from '@/components/lcars/LCARSVariantProvider';
import { UpdateInProgressOverlay } from '@/components/layout/UpdateInProgressOverlay';
import { VersionGuard } from '@/components/layout/VersionGuard';
import { ToastProvider } from '@/components/notifications/ToastProvider';

export const metadata: Metadata = {
  title: 'HomeOS',
  description: 'Kerry HomeOS',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={antonio.variable} suppressHydrationWarning>
      <body>
        <AuthProvider>
          <ThemeProvider>
            <CapabilitiesProvider>
              <AlertProvider>
                <LCARSVariantProvider>
                  <LCARSSoundsProvider>
                    <UpdateInProgressOverlay />
                    <VersionGuard />
                    <ToastProvider />
                    <AuthGate>{children}</AuthGate>
                  </LCARSSoundsProvider>
                </LCARSVariantProvider>
              </AlertProvider>
            </CapabilitiesProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
