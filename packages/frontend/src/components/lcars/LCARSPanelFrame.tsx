'use client';

import { type ReactNode } from 'react';
import { useLCARSVariant } from './LCARSVariantProvider';

/** Shared with `SlidePanel` LCARS shell — left-edge curve clips for panel chrome */
export function LCARSPanelCorner({
  fill,
  variant,
}: {
  fill: string;
  variant: 'top' | 'bottom';
}) {
  const h = 36;
  const w = 14;
  const d =
    variant === 'top'
      ? `M ${w} 0 L ${w} ${h} L 0 ${h} L 0 10 Q 0 0 10 0 Z`
      : `M ${w} 0 L ${w} ${h} L 11 ${h} Q 0 ${h} 0 ${h - 11} L 0 0 Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', flexShrink: 0 }} aria-hidden>
      <path d={d} fill={fill} />
    </svg>
  );
}

/**
 * Inner LCARS display frame: curved header + body + curved footer bar (reference image 4).
 */
export function LCARSPanelFrame({
  title,
  footerCode,
  children,
}: {
  title: string;
  /** Small right-aligned code on footer bar (Okuda-style) */
  footerCode?: string;
  children: ReactNode;
}) {
  const { colors } = useLCARSVariant();
  const accent = colors.accent;
  const endCap = colors.verticalSegments[1] ?? colors.navColors[1] ?? '#cc99cc';

  return (
    <div className="lcars-panel-frame mb-7 w-full" style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.45))' }}>
      <div className="lcars-chrome-row flex w-full min-w-0 items-stretch">
        <LCARSPanelCorner fill={accent} variant="top" />
        <div
          className="lcars-panel-title lcars-chrome-item flex min-h-9 min-w-0 flex-1 items-center px-3 text-[11px] font-bold uppercase tracking-[0.2em]"
          style={{
            background: accent,
            color: '#000',
            fontFamily: 'var(--font-antonio), "Helvetica Neue", sans-serif',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)',
          }}
        >
          <span className="truncate">{title}</span>
        </div>
        <div
          className="lcars-chrome-item min-h-9 w-14 shrink-0 rounded-tr-[18px]"
          style={{ background: endCap, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)' }}
          aria-hidden
        />
      </div>

      <div
        className="lcars-panel-body border-x border-black/50 bg-[var(--color-bg-card)] px-3.5 py-3.5"
        style={{
          borderColor: 'rgba(0,0,0,0.55)',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)',
        }}
      >
        {children}
      </div>

      <div className="lcars-chrome-row flex w-full min-w-0 items-stretch">
        <LCARSPanelCorner fill={accent} variant="bottom" />
        <div
          className="lcars-panel-footer lcars-chrome-item flex min-h-8 min-w-0 flex-1 items-center justify-between px-3 text-[9px] font-bold uppercase tracking-[0.18em]"
          style={{
            background: accent,
            color: '#000',
            fontFamily: 'var(--font-antonio), "Helvetica Neue", sans-serif',
            opacity: 0.92,
            boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.15)',
          }}
        >
          <span className="opacity-70">Display active</span>
          {footerCode ? <span className="tabular-nums">{footerCode}</span> : <span className="opacity-0">00</span>}
        </div>
        <div
          className="lcars-chrome-item min-h-8 w-14 shrink-0 rounded-br-[18px]"
          style={{ background: endCap }}
          aria-hidden
        />
      </div>
    </div>
  );
}
