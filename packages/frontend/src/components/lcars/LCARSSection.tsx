'use client';

import { useMemo, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { useTheme } from '@/providers/ThemeProvider';
import { LCARSPanelFrame } from './LCARSPanelFrame';

/**
 * LCARS data block with curved header + footer chrome (reference image 4).
 */
export function LCARSSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const { activeTheme } = useTheme();

  const footerCode = useMemo(() => {
    const h = title.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return `${(h % 800) + 200}-${(h % 900) + 100}`;
  }, [title]);

  if (activeTheme !== 'lcars') {
    return (
      <section className={clsx('mb-6', className)}>
        <h2 className="text-sm font-medium mb-3" style={{ color: 'var(--color-text-secondary)' }}>
          {title}
        </h2>
        {children}
      </section>
    );
  }

  return (
    <section className={clsx(className)}>
      <LCARSPanelFrame title={title} footerCode={footerCode}>
        {children}
      </LCARSPanelFrame>
    </section>
  );
}
