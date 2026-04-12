'use client';

import { useTheme } from '@/providers/ThemeProvider';
import { usePathname } from 'next/navigation';
import { useState, useEffect, type ReactNode } from 'react';
import { LCARSSidebar } from './LCARSSidebar';
import { LCARSStartup } from './LCARSStartup';
import { LCARSElbow } from './LCARSElbow';
import { useConnected } from '@/hooks/useWebSocket';
import { useLCARSVariant } from './LCARSVariantProvider';
import { useAlert } from './LCARSAlertOverlay';
import {
  TERMINAL_PANEL_HEIGHT,
  useSystemTerminal,
  useSystemTerminalBottomInset,
} from '@/providers/SystemTerminalProvider';
import { SystemTerminalDock } from '@/components/layout/SystemTerminalDock';
import { lcarsVerticalRailGradient } from './lcarsRailGradient';
import { LCARSBreadcrumbBlocks } from './LCARSBreadcrumbBlocks';
import { getBreadcrumbItems } from '@/lib/appBreadcrumbs';
import { AppVersionLabel } from '../layout/AppVersionLabel';
import { AssistantHeaderButton } from '../ChatBot';

const BAR_W = 150;
const BAR_W_COLLAPSED = 56;
const HEADER_H = 28;
const FOOTER_H = 28;
const OUTER_R = 50;
/** Horizontal extension east of sidebar (svg width, content `left` margin) */
const INNER_R = 28;
const FRAME_STRIPE_W = 4;
const CONTENT_EDGE = 10;
/** Pull rail under elbows by 1px and paint elbows above — removes anti-alias gaps at seams */
const RAIL_SEAM_OVERLAP = 2;

interface LCARSFrameProps {
  children: ReactNode;
  collapsed: boolean;
  onToggle: () => void;
}

export function LCARSFrame({ children, collapsed, onToggle }: LCARSFrameProps) {
  const { activeTheme } = useTheme();
  const connected = useConnected();
  const pathname = usePathname();
  const { colors } = useLCARSVariant();
  const { alertLevel } = useAlert();
  const terminalInset = useSystemTerminalBottomInset();
  const { open: terminalOpen, setOpen: setTerminalOpen, canUse: canUseTerminal } = useSystemTerminal();
  const [showStartup, setShowStartup] = useState(false);
  /** Status viewer band when terminal open: ~20% viewport, clamped for usability */
  const [statusViewerBandH, setStatusViewerBandH] = useState(TERMINAL_PANEL_HEIGHT);

  useEffect(() => {
    const syncBand = () => {
      if (typeof window === 'undefined') return;
      const h = window.innerHeight;
      setStatusViewerBandH(Math.max(160, Math.min(320, Math.round(h * 0.2))));
    };
    syncBand();
    window.addEventListener('resize', syncBand);
    return () => window.removeEventListener('resize', syncBand);
  }, []);

  useEffect(() => {
    if (sessionStorage.getItem('lcars-booted')) return;
    const raf = requestAnimationFrame(() => {
      if (sessionStorage.getItem('lcars-booted')) return;
      sessionStorage.setItem('lcars-booted', '1');
      setShowStartup(true);
      setTimeout(() => setShowStartup(false), 3800);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  if (activeTheme !== 'lcars') return <>{children}</>;
  if (showStartup) return <LCARSStartup onDismiss={() => setShowStartup(false)} />;

  const breadcrumbItems = getBreadcrumbItems(pathname ?? '/');
  const barW = collapsed ? BAR_W_COLLAPSED : BAR_W;
  const or = Math.min(OUTER_R, barW);
  const elbowW = barW + INNER_R;
  const topElbowH = HEADER_H + or;
  const bottomElbowH = FOOTER_H + or;

  /** Top band only when status viewer (system terminal) is open; default = header + elbow flush to viewport top. */
  const showTopTerminal = canUseTerminal && terminalOpen;
  const topChromeH = showTopTerminal ? statusViewerBandH : 0;
  /** Rail starts at `topChromeH` when terminal open; cap fills stem under top elbow only */
  const navStackOffsetPx = topElbowH - RAIL_SEAM_OVERLAP;
  const contentTop = topChromeH + Math.max(topElbowH, HEADER_H) + 4;
  const contentLeft = elbowW;
  const contentBottom = FOOTER_H + 2 + terminalInset;
  const framePin = colors.verticalSegments[1] ?? colors.navColors[1] ?? '#cc99cc';

  const alertClass = alertLevel === 'red' ? 'lcars-alert-red' : alertLevel === 'yellow' ? 'lcars-alert-yellow' : '';

  return (
    <div className={`lcars-frame ${alertClass}`} style={{ minHeight: '100vh', background: '#000' }}>

      {showTopTerminal && (
        <>
          <div
            aria-hidden
            className="lcars-status-sidebar-cap"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: barW,
              height: topChromeH,
              zIndex: 43,
              background: colors.verticalSegments[0] ?? colors.elbowTop,
              boxSizing: 'border-box',
              borderBottom: '3px solid #000',
              borderTopLeftRadius: or,
              overflow: 'hidden',
              transition: 'height 0.2s ease-out, width 0.2s ease-in-out, background 0.3s ease',
              pointerEvents: 'none',
            }}
          >
            <span
              style={{
                position: 'absolute',
                bottom: 10,
                right: 8,
                color: colors.text,
                fontFamily: 'var(--font-antonio), "Helvetica Neue", sans-serif',
                fontWeight: 700,
                fontSize: 9,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                opacity: 0.92,
              }}
            >
              01-LOG
            </span>
          </div>
          <SystemTerminalDock
            sidebarOffsetPx={elbowW}
            onClose={() => setTerminalOpen(false)}
            placement="top"
            panelHeightPx={topChromeH}
          />
        </>
      )}

      <div className="lcars-elbow-top" style={{
        position: 'fixed', top: topChromeH, left: 0, zIndex: 44, lineHeight: 0,
        transition: 'top 0.2s ease-out, left 0.2s ease-in-out',
      }}>
        <LCARSElbow
          position="top-left"
          barWidth={barW}
          barHeight={HEADER_H}
          outerRadius={or}
          innerRadius={INNER_R}
          color={colors.elbowTop}
          className="lcars-cascade-0"
          alertOutline={alertLevel === 'red'}
        />
      </div>

      <div
        className="lcars-header-bar lcars-cascade-1"
        style={{
          position: 'fixed', top: topChromeH, right: 0,
          left: elbowW,
          height: HEADER_H,
          zIndex: 41,
          display: 'flex',
          alignItems: 'stretch',
          background: '#000',
          transition: 'top 0.2s ease-out, left 0.2s ease-in-out',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            alignSelf: 'stretch',
            gap: 8,
            paddingLeft: 10,
            paddingRight: 6,
            flexShrink: 0,
            minHeight: HEADER_H,
            background: colors.headerBar,
            transition: 'background 0.3s ease',
          }}
        >
          <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
            <span className="lcars-blink-1 lcars-chrome-item" style={{ width: 4, height: 14, borderRadius: 0, background: colors.navColors[1] || colors.accent }} />
            <span className="lcars-blink-2 lcars-chrome-item" style={{ width: 4, height: 14, borderRadius: 0, background: colors.navColors[3] || colors.accent }} />
            <span className="lcars-blink-3 lcars-chrome-item" style={{ width: 4, height: 14, borderRadius: 0, background: colors.navColors[5] || colors.muted }} />
          </div>
        </div>
        {/* Black only between crumb segments; filler keeps headerBar continuous to the right */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: HEADER_H,
            display: 'flex',
            alignItems: 'stretch',
            alignSelf: 'stretch',
            background: colors.headerBar,
            transition: 'background 0.3s ease',
          }}
        >
          <div style={{ width: 3, flexShrink: 0, background: '#000', alignSelf: 'stretch' }} aria-hidden />
          <div
            style={{
              display: 'flex',
              alignItems: 'stretch',
              alignSelf: 'stretch',
              gap: 3,
              flexShrink: 0,
              minHeight: HEADER_H,
              height: '100%',
              background: '#000',
              boxSizing: 'border-box',
            }}
          >
            <LCARSBreadcrumbBlocks
              items={breadcrumbItems}
              navColors={colors.navColors.length ? colors.navColors : [colors.accent, colors.muted]}
              textColor={colors.text}
              barHeight={HEADER_H}
            />
          </div>
          <div
            className="lcars-chrome-item lcars-header-filler"
            style={{ flex: 1, minWidth: 0, alignSelf: 'stretch', minHeight: HEADER_H, background: colors.headerBar }}
            aria-hidden
          />
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'stretch',
            alignSelf: 'stretch',
            flexShrink: 0,
            minHeight: HEADER_H,
            background: colors.headerBar,
            transition: 'background 0.3s ease',
          }}
        >
          <div style={{ width: 3, flexShrink: 0, background: '#000', alignSelf: 'stretch' }} aria-hidden />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              alignSelf: 'stretch',
              paddingLeft: 8,
              paddingRight: 8,
              flexShrink: 0,
            }}
          >
            <div
              className="lcars-chrome-item"
              style={{
                width: 7,
                height: 7,
                borderRadius: 0,
                background: connected ? '#99cc66' : '#cc4444',
              }}
              title={connected ? 'Connected' : 'Disconnected'}
            />
          </div>
          <div style={{ width: 3, flexShrink: 0, background: '#000', alignSelf: 'stretch' }} aria-hidden />
          <AssistantHeaderButton variant="lcars" style={{ backgroundColor: colors.accent, color: colors.text }} />
          <div style={{ width: 3, flexShrink: 0, background: '#000', alignSelf: 'stretch' }} aria-hidden />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              alignSelf: 'stretch',
              paddingLeft: 8,
              paddingRight: 10,
              flexShrink: 0,
            }}
          >
            <AppVersionLabel variant="lcars" lcarsTextColor={colors.text} />
          </div>
        </div>
        <div
          className="lcars-chrome-item"
          style={{
            width: 12,
            alignSelf: 'stretch',
            minHeight: HEADER_H,
            background: colors.headerBar,
            borderRadius: 0,
            flexShrink: 0,
            transition: 'background 0.3s ease',
          }}
        />
      </div>

      <div
        className="lcars-vertical-rail"
        style={{
          position: 'fixed',
          top: showTopTerminal ? topChromeH : 0,
          bottom: bottomElbowH - RAIL_SEAM_OVERLAP,
          left: 0,
          width: barW,
          zIndex: 42,
          paddingLeft: 0,
          paddingRight: 0,
          background: lcarsVerticalRailGradient(colors),
          /* Top only: bottom outer curve is the elbow SVG — bottomLeft radius here cut a notch above it */
          borderTopLeftRadius: or,
          /* Heavy inset shadow made the nav column read narrower than the elbow stem */
          boxShadow: 'inset -2px 0 8px rgba(0,0,0,0.28)',
          transition: 'top 0.2s ease-out, width 0.2s ease-in-out, background 0.3s ease, box-shadow 0.3s ease',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minHeight: 0,
          boxSizing: 'border-box',
          ['--lcars-rail-w' as string]: `${barW}px`,
        }}
      >
        <LCARSSidebar
          railWidthPx={barW}
          navStackOffsetPx={navStackOffsetPx}
          onToggle={onToggle}
          collapsed={collapsed}
        />
      </div>

      <div className="lcars-elbow-bottom" style={{
        position: 'fixed', bottom: 0, left: 0, zIndex: 44, lineHeight: 0,
        transition: 'all 0.2s ease-in-out',
      }}>
        <LCARSElbow
          position="bottom-left"
          barWidth={barW}
          barHeight={FOOTER_H}
          outerRadius={or}
          innerRadius={INNER_R}
          color={colors.elbowBottom}
          className="lcars-cascade-7"
          alertOutline={alertLevel === 'red'}
        />
      </div>

      <div className="lcars-footer-bar lcars-cascade-6" style={{
        position: 'fixed', bottom: 0, right: 0,
        left: elbowW,
        height: FOOTER_H, zIndex: 41,
        display: 'flex', alignItems: 'stretch', gap: 3,
        transition: 'left 0.2s ease-in-out',
      }}>
        <div className="lcars-footer-segment lcars-chrome-item lcars-scan-container" style={{
          flex: 2, background: colors.footerSegments[0] || colors.footerBar,
          position: 'relative', overflow: 'hidden',
          transition: 'background 0.3s ease',
        }}>
          <div className="lcars-scan-bar" />
        </div>
        {colors.footerSegments.slice(1, -1).map((color, i) => (
          <div key={i} className="lcars-footer-segment lcars-chrome-item" style={{ flex: 1, background: color, transition: 'background 0.3s ease' }} />
        ))}
        <div className="lcars-footer-segment lcars-chrome-item" style={{
          flex: 2, background: colors.footerSegments[colors.footerSegments.length - 1] || colors.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 14,
          transition: 'background 0.3s ease',
        }}>
          <span style={{
            color: colors.text, fontFamily: 'var(--font-antonio), "Helvetica Neue", sans-serif',
            fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>
            USS Kerry NCC-2024
          </span>
        </div>
        <div className="lcars-footer-segment lcars-chrome-item" style={{
          width: 20, background: colors.footerSegments[colors.footerSegments.length - 1] || colors.accent,
          borderRadius: '0 999px 999px 0', flexShrink: 0,
          transition: 'background 0.3s ease',
        }} />
      </div>

      <main className="lcars-content" style={{
        marginLeft: contentLeft,
        marginTop: contentTop,
        marginBottom: contentBottom,
        marginRight: CONTENT_EDGE,
        minHeight: `calc(100vh - ${contentTop + contentBottom}px)`,
        padding: `12px ${CONTENT_EDGE + 6}px 16px ${FRAME_STRIPE_W + 14}px`,
        borderLeft: `${FRAME_STRIPE_W}px solid ${framePin}`,
        background: `linear-gradient(90deg, color-mix(in srgb, ${colors.elbowTop} 18%, #000) 0%, color-mix(in srgb, ${colors.elbowTop} 6%, #0a0a12) 12%, var(--color-bg) 38%)`,
        boxShadow: 'inset 6px 0 14px -6px rgba(0,0,0,0.55)',
        overflowY: 'auto',
        transition: 'margin-top 0.2s ease-out, margin-left 0.2s ease-in-out, border-color 0.3s ease, background 0.3s ease',
      }}>
        {children}
      </main>

      {alertLevel === 'yellow' && (
        <div
          className="lcars-alert-vignette"
          style={{
            position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9998,
            boxShadow: 'inset 0 0 100px 24px #ffcc0022',
            animation: 'lcars-alert-pulse 1.5s ease-in-out infinite',
          }}
        />
      )}
    </div>
  );
}
