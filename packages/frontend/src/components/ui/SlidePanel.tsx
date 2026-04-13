'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useMemo } from 'react';
import { useTheme } from '@/providers/ThemeProvider';
import { LCARSPanelCorner } from '@/components/lcars/LCARSPanelFrame';
import { useLCARSVariant } from '@/components/lcars/LCARSVariantProvider';
import { useLCARSFrame } from '@/components/lcars/LCARSFrameContext';

const SIZE_CLASS = {
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
} as const;

export function SlidePanel({
  open,
  onClose,
  title,
  children,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Wider panels for JSON / multi-column inspectors */
  size?: keyof typeof SIZE_CLASS;
}) {
  const { activeTheme } = useTheme();
  const { colors } = useLCARSVariant();
  const frame = useLCARSFrame();
  const footerCode = useMemo(() => {
    const h = title.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return `${(h % 800) + 200}-${(h % 900) + 100}`;
  }, [title]);

  const isLcars = activeTheme === 'lcars';
  const accent = colors.accent;
  const endCap = colors.verticalSegments[1] ?? colors.navColors[1] ?? '#cc99cc';

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={isLcars ? 'fixed inset-0 z-40 bg-black/55' : 'fixed inset-0 z-40 bg-black/40'}
        />
        {isLcars ? (
          <Dialog.Content
            className={`fixed z-50 flex min-h-0 flex-row outline-none ${SIZE_CLASS[size]}`}
            style={{
              top: frame ? frame.contentTop : 0,
              right: frame ? frame.contentRight : 0,
              bottom: frame ? frame.contentBottom : 0,
              backgroundColor: '#000',
              filter: 'drop-shadow(-8px 0 24px rgba(0,0,0,0.5))',
            }}
          >
            <Dialog.Title className="sr-only">{title}</Dialog.Title>
            <Dialog.Description className="sr-only">{title} panel</Dialog.Description>

            {/* Left skinny rail */}
            <div
              style={{
                width: 8,
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 0,
              }}
            >
              {/* Rail top cap — connects to header bar */}
              <div style={{ height: 36, background: accent, borderTopLeftRadius: 14 }} />
              {/* Rail body */}
              <div style={{ flex: 1, background: endCap, marginTop: 2 }} />
              {/* Rail bottom cap — connects to footer bar */}
              <div style={{ height: 32, background: accent, borderBottomLeftRadius: 14, marginTop: 2 }} />
            </div>

            {/* Main panel column */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', marginLeft: 2 }}>
              {/* Header bar */}
              <div
                className="lcars-chrome-item flex min-h-9 min-w-0 shrink-0 items-center px-3 text-[11px] font-bold uppercase tracking-[0.2em]"
                style={{
                  background: accent,
                  color: '#000',
                  fontFamily: 'var(--font-antonio), "Helvetica Neue", sans-serif',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span className="truncate" style={{ flex: 1, minWidth: 0 }}>{title}</span>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="rounded p-1 transition-opacity hover:opacity-80"
                    style={{ color: '#000', flexShrink: 0, marginLeft: 8 }}
                    aria-label="Close panel"
                  >
                    <X className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                </Dialog.Close>
              </div>

              {/* Body */}
              <div
                className="lcars-panel-body min-h-0 flex-1 overflow-y-auto px-3.5 py-3.5"
                style={{
                  backgroundColor: 'var(--color-bg-card)',
                  marginTop: 2,
                  boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)',
                }}
              >
                {children}
              </div>

              {/* Footer bar */}
              <div
                className="lcars-chrome-item flex min-h-8 min-w-0 shrink-0 items-center justify-between px-3 text-[9px] font-bold uppercase tracking-[0.18em]"
                style={{
                  background: accent,
                  color: '#000',
                  fontFamily: 'var(--font-antonio), "Helvetica Neue", sans-serif',
                  opacity: 0.92,
                  boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.15)',
                  marginTop: 2,
                }}
              >
                <span className="opacity-70">Inspector active</span>
                <span className="tabular-nums">{footerCode}</span>
              </div>
            </div>
          </Dialog.Content>
        ) : (
          <Dialog.Content
            className={`fixed right-0 top-0 z-50 h-full w-full overflow-y-auto border-l shadow-xl ${SIZE_CLASS[size]}`}
            style={{
              backgroundColor: 'var(--color-bg)',
              borderColor: 'var(--color-border)',
            }}
          >
            <div
              className="sticky top-0 z-10 flex items-center justify-between border-b px-4 py-3"
              style={{
                backgroundColor: 'var(--color-bg)',
                borderColor: 'var(--color-border)',
              }}
            >
              <Dialog.Title className="text-sm font-semibold">{title}</Dialog.Title>
              <Dialog.Description className="sr-only">{title} panel</Dialog.Description>
              <Dialog.Close asChild>
                <button className="rounded-md p-1 hover:bg-[var(--color-bg-hover)] transition-colors">
                  <X className="h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />
                </button>
              </Dialog.Close>
            </div>
            <div className="p-4">{children}</div>
          </Dialog.Content>
        )}
      </Dialog.Portal>
    </Dialog.Root>
  );
}
