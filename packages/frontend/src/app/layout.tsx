import type { Metadata } from 'next';
import { Antonio } from 'next/font/google';
import './globals.css';

const antonio = Antonio({
  subsets: ['latin'],
  variable: '--font-antonio',
  display: 'swap',
});
import { ThemeProvider } from '@/providers/ThemeProvider';
import { AuthProvider } from '@/providers/AuthProvider';
import { AuthGate } from '@/components/layout/AuthGate';
import { AlertProvider } from '@/components/lcars/LCARSAlertOverlay';
import { LCARSSoundsProvider } from '@/components/lcars/LCARSSounds';
import { LCARSVariantProvider } from '@/components/lcars/LCARSVariantProvider';

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
            <AlertProvider>
              <LCARSVariantProvider>
                <LCARSSoundsProvider>
                  <AuthGate>{children}</AuthGate>
                </LCARSSoundsProvider>
              </LCARSVariantProvider>
            </AlertProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
