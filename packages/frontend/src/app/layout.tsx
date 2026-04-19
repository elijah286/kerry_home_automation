import type { Metadata, Viewport } from 'next';
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
import { TunnelStatusBanner } from '@/components/layout/TunnelStatusBanner';
import { ToastProvider } from '@/components/notifications/ToastProvider';

export const metadata: Metadata = {
  title: 'HomeOS',
  description: 'Kerry HomeOS',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={antonio.variable} suppressHydrationWarning>
      <head>
        {/* Belt-and-suspenders: Next's `viewport` export should inject this,
            but we also render it literally in the root layout so the meta
            tag is guaranteed to appear in the production HTML regardless of
            build-mode quirks. Without it, iOS Safari uses a ~980px virtual
            viewport and renders the whole app desktop-shrunk. */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body>
        <AuthProvider>
          <ThemeProvider>
            <CapabilitiesProvider>
              <AlertProvider>
                <LCARSVariantProvider>
                  <LCARSSoundsProvider>
                    <UpdateInProgressOverlay />
                    <TunnelStatusBanner />
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
