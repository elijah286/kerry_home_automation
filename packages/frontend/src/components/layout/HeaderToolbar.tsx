'use client';

import type { CSSProperties } from 'react';
import { clsx } from 'clsx';
import { PinElevationControls } from './PinElevationControls';
import { AssistantHeaderButton, MapLayersHeaderButton } from '../ChatBot';
import { AppVersionLabel } from './AppVersionLabel';
import { useSystemTerminal } from '@/providers/SystemTerminalProvider';

/**
 * Header actions (pins, status log, map layers, assistant, version).
 * Shown inline on `md+`; on small screens these move into the mobile nav drawer.
 */
export function HeaderToolbar({ layout = 'header' }: { layout?: 'header' | 'drawer' }) {
  const {
    canUse: canUseTerminal,
    open: terminalOpen,
    setOpen: setTerminalOpen,
    hasRecentLogError,
  } = useSystemTerminal();

  const isDrawer = layout === 'drawer';

  return (
    <div
      className={clsx(
        isDrawer
          ? 'flex flex-col gap-2 w-full'
          : 'flex shrink-0 flex-row flex-wrap items-center justify-end gap-2',
      )}
    >
      <div className={clsx(isDrawer && 'w-full')}>
        <PinElevationControls variant="default" />
      </div>
      {canUseTerminal && (
        <button
          type="button"
          onClick={() => setTerminalOpen(!terminalOpen)}
          className={clsx(
            'rounded-md text-xs font-semibold uppercase tracking-wide transition-colors',
            isDrawer ? 'w-full py-2.5 px-3' : 'px-2.5 py-1.5',
            hasRecentLogError && 'system-status-log-error-alert',
          )}
          aria-label={hasRecentLogError ? 'Status — recent error in system log' : 'Open system log'}
          style={{
            ...(hasRecentLogError
              ? ({
                  '--status-alert-base': terminalOpen ? 'var(--color-accent)' : 'var(--color-bg-hover)',
                  '--status-alert-fg-base': '#fff',
                  '--status-alert-border-base': 'var(--color-border)',
                } as CSSProperties)
              : {}),
            backgroundColor: hasRecentLogError
              ? undefined
              : terminalOpen
                ? 'var(--color-accent)'
                : 'var(--color-bg-hover)',
            color: hasRecentLogError ? undefined : '#fff',
            border: '1px solid',
            borderColor: hasRecentLogError ? undefined : 'var(--color-border)',
          }}
        >
          Status
        </button>
      )}
      <div
        className={clsx(
          'flex items-center gap-2',
          isDrawer && 'w-full flex-wrap justify-center gap-3 py-1',
        )}
      >
        <MapLayersHeaderButton variant="default" />
        <AssistantHeaderButton variant="default" />
      </div>
      <div className={clsx(isDrawer && 'pt-1 w-full flex justify-center')}>
        <AppVersionLabel />
      </div>
    </div>
  );
}
