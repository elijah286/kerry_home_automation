'use client';

import { useMemo } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useConnected } from '@/hooks/useWebSocket';
import { useSystemTerminal, type TerminalLogFilter } from '@/providers/SystemTerminalProvider';
import { useLCARSVariant } from './LCARSVariantProvider';
import { useAlert } from './LCARSAlertOverlay';

const FILTERS: { id: TerminalLogFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'info', label: 'Info' },
  { id: 'warn', label: 'Warn' },
  { id: 'error', label: 'Err' },
];

function hashSeed(n: number): number {
  return ((n * 7919) % 9973) / 9973;
}

/** Dense multi-column readout (reference: long-range scan header). */
function DenseReadout({
  deviceCount,
  integrationCount,
  connectedCount,
  connected,
  rowsPerCol = 5,
  showSummaryRow = true,
  redAlertFlash = false,
}: {
  deviceCount: number;
  integrationCount: number;
  connectedCount: number;
  connected: boolean;
  rowsPerCol?: number;
  showSummaryRow?: boolean;
  /** Match LCARS red-alert GIF: some scan lines strobe crimson */
  redAlertFlash?: boolean;
}) {
  const scanSeed = deviceCount + integrationCount * 13;
  const cols = useMemo(() => {
    const mk = (base: number) =>
      Array.from({ length: rowsPerCol }, (_, r) => {
        const v = Math.floor((hashSeed(base + r + scanSeed) * 900000) + 100000);
        return `${v}-${(hashSeed(r * 17 + scanSeed) * 99).toFixed(0).padStart(2, '0')}`;
      });
    return [mk(1), mk(2), mk(3)];
  }, [deviceCount, integrationCount, rowsPerCol, scanSeed]);

  return (
    <div
      className={`lcars-status-dense grid min-w-0 flex-[1.1] gap-x-3 gap-y-px font-mono uppercase leading-tight tracking-tight ${rowsPerCol > 5 ? 'text-[6px]' : 'text-[7px]'}`}
      style={{
        color: 'rgba(255,255,255,0.72)',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      }}
    >
      {cols.map((col, ci) => (
        <div key={ci} className="flex min-w-0 flex-col gap-px">
          {col.map((line, ri) => {
            const flash =
              redAlertFlash && hashSeed(ci * 47 + ri * 19 + scanSeed * 0.01) > 0.52;
            return (
              <div key={ri} className={`truncate${flash ? ' lcars-status-line--red-alert' : ''}`}>
                {line}
              </div>
            );
          })}
        </div>
      ))}
      {showSummaryRow && (
        <div
          className="col-span-3 mt-1 flex flex-wrap gap-x-4 gap-y-0 border-t border-white/10 pt-1 text-[7px]"
          style={{ color: 'rgba(255,200,120,0.95)' }}
        >
          <span>NET {connected ? 'NOMINAL' : 'OFFLINE'}</span>
          <span>DEV {deviceCount}</span>
          <span>LNK {connectedCount}/{integrationCount}</span>
        </div>
      )}
    </div>
  );
}

export type LCARSStatusStripVariant = 'strip' | 'deck';

export function LCARSStatusStrip({
  variant = 'strip',
  deckHeight,
}: {
  variant?: LCARSStatusStripVariant;
  /** When variant is deck, matches fixed parent height for layout math */
  deckHeight?: number;
}) {
  const { colors } = useLCARSVariant();
  const { alertLevel } = useAlert();
  const connected = useConnected();
  const { devices, integrations } = useWebSocket();
  const { canUse, open, setOpen, logFilter, setLogFilter } = useSystemTerminal();

  const integList = Object.values(integrations);
  const connectedCount = integList.filter((h) => h.state === 'connected').length;

  const isDeck = variant === 'deck';
  const conditionLabel =
    alertLevel === 'red'
      ? 'CONDITION RED'
      : alertLevel === 'yellow'
        ? 'CONDITION YELLOW'
        : 'NOMINAL';

  return (
    <div
      className={`lcars-status-strip lcars-chrome-row flex min-w-0 items-stretch gap-3 border-b border-black/60 ${
        isDeck ? 'h-full min-h-0 flex-row px-2.5 py-1.5' : 'min-h-[52px] flex-row px-3 py-1.5'
      }`}
      style={{
        minHeight: isDeck && deckHeight ? deckHeight : undefined,
        background: 'linear-gradient(180deg, #050508 0%, #0a0a12 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      <DenseReadout
        deviceCount={devices.length}
        integrationCount={integList.length}
        connectedCount={connectedCount}
        connected={connected}
        rowsPerCol={isDeck ? 7 : 5}
        showSummaryRow={!isDeck}
        redAlertFlash={alertLevel === 'red'}
      />

      <div
        className={`flex min-w-0 flex-col border-l border-white/10 pl-3 ${
          isDeck ? 'max-w-[min(100%,22rem)] flex-[0_0_auto] justify-between' : 'flex-1 justify-center gap-1.5'
        }`}
      >
        {isDeck ? (
          <div className="flex flex-col gap-1 pt-0.5">
            <div
              className="text-right font-bold uppercase"
              style={{
                color: 'rgba(255, 255, 255, 0.92)',
                fontFamily: 'var(--font-antonio), sans-serif',
                fontSize: 10,
                letterSpacing: '0.14em',
                lineHeight: 1.1,
              }}
            >
              SYSTEM · {conditionLabel}
            </div>
            <div
              className="text-right font-mono text-[6px] uppercase tracking-tight"
              style={{ color: 'rgba(255,200,120,0.88)' }}
            >
              NET {connected ? 'NOMINAL' : 'OFFLINE'} · DEV {devices.length} · LNK {connectedCount}/{integList.length}
            </div>
          </div>
        ) : (
          <div className="text-[8px] font-bold uppercase tracking-[0.18em]" style={{ color: colors.accent }}>
            System status
          </div>
        )}
        <div className={`flex flex-wrap items-center gap-1.5 ${isDeck ? 'mt-auto justify-end' : ''}`}>
          {FILTERS.map(({ id, label }) => {
            const active = logFilter === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setLogFilter(id)}
                className="lcars-filter-pill lcars-chrome-item border-0 px-2 py-0.5 text-[7px] font-bold uppercase tracking-wider transition-[filter,transform] hover:brightness-110 active:scale-[0.98]"
                style={{
                  background: active ? colors.navActive : colors.muted,
                  color: '#000',
                  fontFamily: 'var(--font-antonio), sans-serif',
                  borderRadius: '0 999px 999px 0',
                  boxShadow: active ? 'inset 0 1px 0 rgba(255,255,255,0.35)' : 'none',
                }}
              >
                {label}
              </button>
            );
          })}
          {canUse && (
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="lcars-chrome-item border-0 px-2 py-0.5 text-[7px] font-bold uppercase tracking-wider hover:brightness-110"
              style={{
                background: open ? colors.navColors[2] ?? colors.accent : colors.navColors[4] ?? colors.muted,
                color: '#000',
                fontFamily: 'var(--font-antonio), sans-serif',
                borderRadius: '0 999px 999px 0',
              }}
            >
              {open ? 'Hide log' : 'Log'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
