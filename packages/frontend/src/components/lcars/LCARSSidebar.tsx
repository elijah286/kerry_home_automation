'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import { useSystemTerminal } from '@/providers/SystemTerminalProvider';
import { useLCARSVariant, type ResolvedColors } from './LCARSVariantProvider';
import { useAlert, type AlertLevel } from './LCARSAlertOverlay';

const mainNavItems: { href: string; label: string }[] = [
  { href: '/', label: 'Operations' },
  { href: '/devices', label: 'Devices' },
  { href: '/cameras', label: 'Sensors' },
  { href: '/recipes', label: 'Replicator' },
  { href: '/alarms', label: 'Alerts' },
  { href: '/calendar', label: 'Temporal' },
  { href: '/locations', label: 'Spatial' },
];

const lcarsNavItems: { href: string; label: string }[] = [
  { href: '/bridge', label: 'Bridge' },
  { href: '/tactical', label: 'Tactical' },
  { href: '/engineering', label: 'Engineering' },
  { href: '/star-chart', label: 'Star Chart' },
];

const settingsItem = { href: '/settings', label: 'Config' };

function collapsedLabel(label: string): string {
  if (label.length <= 3) return label.toUpperCase();
  const parts = label.split(/[\s/-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return parts.map((p) => p[0]).join('').slice(0, 3).toUpperCase();
  }
  return label.slice(0, 3).toUpperCase();
}

function fillerColor(colors: ResolvedColors, index: number): string {
  const { verticalSegments, navColors, muted, elbowBottom } = colors;
  if (verticalSegments.length > 0) {
    return verticalSegments[index % verticalSegments.length];
  }
  if (navColors.length > 0) {
    return navColors[(index + 3) % navColors.length];
  }
  return muted ?? elbowBottom;
}

/**
 * LCARS sidebar — blocks flush with elbow stem width; black gutters only between blocks;
 * inert colored fillers replace empty flex gaps; labels bottom-right.
 */
export function LCARSSidebar({
  railWidthPx,
  navStackOffsetPx,
  onToggle,
  collapsed,
}: {
  /** Must match `barW` on the frame / elbow SVG so edges align */
  railWidthPx: number;
  /** Viewport offset from top to first nav block (status/terminal + elbow seam) */
  navStackOffsetPx: number;
  onToggle: () => void;
  collapsed: boolean;
}) {
  const pathname = usePathname();
  const { user, isAdmin } = useAuth();
  const { canUse: canUseTerminal, showNavButton, open: terminalOpen, setOpen: setTerminalOpen } =
    useSystemTerminal();
  const { colors } = useLCARSVariant();
  const { alertLevel } = useAlert();
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  let stagger = 0;

  const fillMid = fillerColor(colors, 1);
  const fillLow = fillerColor(colors, 2);
  const fillCap = fillerColor(colors, 3);
  const topCapColor = colors.verticalSegments[0] ?? colors.elbowTop;

  return (
    <div
      className="lcars-sidebar-root"
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        width: railWidthPx,
        minWidth: railWidthPx,
        maxWidth: railWidthPx,
        boxSizing: 'border-box',
      }}
    >
      <div
        aria-hidden
        className="lcars-sidebar-top-cap"
        style={{
          flexShrink: 0,
          height: navStackOffsetPx,
          width: '100%',
          background: topCapColor,
          pointerEvents: 'none',
          boxSizing: 'border-box',
        }}
      />
      <div
        className="lcars-sidebar-rail-inner"
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
          /* Let column children shrink to rail width; nowrap labels otherwise inflate min-width and clip on the right */
          minWidth: 0,
          width: railWidthPx,
          maxWidth: railWidthPx,
          boxSizing: 'border-box',
          padding: 0,
          gap: 2,
          background: '#000',
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
        }}
      >
      {mainNavItems.map((item) => (
        <NavBlock
          key={item.href}
          href={item.href}
          label={item.label}
          color={colors.navColors[stagger % colors.navColors.length]}
          activeColor={colors.navActive}
          active={isActive(item.href)}
          collapsed={collapsed}
          alertLevel={alertLevel}
          staggerIndex={stagger++}
        />
      ))}

      {lcarsNavItems.map((item) => (
        <NavBlock
          key={item.href}
          href={item.href}
          label={item.label}
          color={colors.navColors[stagger % colors.navColors.length]}
          activeColor={colors.navActive}
          active={isActive(item.href)}
          collapsed={collapsed}
          alertLevel={alertLevel}
          staggerIndex={stagger++}
        />
      ))}

      <div
        className="lcars-rail-filler"
        aria-hidden
        style={{ flex: '1 1 12px', minHeight: 8, minWidth: 0, background: fillMid }}
      />

      {canUseTerminal && showNavButton && (
        <button
          type="button"
          onClick={() => setTerminalOpen(!terminalOpen)}
          title={collapsed ? (terminalOpen ? 'Hide log' : 'Log') : undefined}
          className="lcars-nav-block lcars-chrome-item"
          style={{
            ...blockBase(collapsed),
            background: terminalOpen ? colors.navActive : colors.muted,
            border: 'none',
            cursor: 'pointer',
            color: '#000',
            fontFamily: 'var(--font-antonio), "Helvetica Neue", sans-serif',
            fontWeight: 600,
            fontSize: collapsed ? 10 : 11,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            ...redAlertStagger(alertLevel, stagger++),
          }}
        >
          {collapsed ? (terminalOpen ? 'Hide' : 'Log') : terminalOpen ? 'Hide log' : 'System log'}
        </button>
      )}

      {isAdmin && (
        <NavBlock
          href={settingsItem.href}
          label={settingsItem.label}
          color={colors.muted}
          activeColor={colors.navActive}
          active={isActive(settingsItem.href)}
          collapsed={collapsed}
          alertLevel={alertLevel}
          staggerIndex={stagger++}
        />
      )}

      {user && (
        <Link
          href="/settings/account"
          title={collapsed ? user.displayName : undefined}
          className="lcars-nav-block lcars-chrome-item"
          style={{
            ...blockBase(collapsed),
            background: isActive('/settings/account') ? colors.navActive : colors.muted,
            border: 'none',
            cursor: 'pointer',
            color: '#000',
            fontFamily: 'var(--font-antonio), "Helvetica Neue", sans-serif',
            fontWeight: isActive('/settings/account') ? 700 : 600,
            fontSize: collapsed ? 10 : 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            textDecoration: 'none',
            ...redAlertStagger(alertLevel, stagger++),
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.filter = 'brightness(1.12)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.filter = 'brightness(1)';
          }}
        >
          <span
            style={{
              lineHeight: 1.15,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: collapsed ? 'normal' : 'nowrap',
              maxWidth: '100%',
              minWidth: 0,
              width: '100%',
              display: 'block',
            }}
          >
            {collapsed ? 'You' : user.displayName}
          </span>
        </Link>
      )}

      <div
        className="lcars-rail-filler"
        aria-hidden
        style={{ flex: '1 1 8px', minHeight: 4, minWidth: 0, background: fillLow }}
      />

      <button
        type="button"
        onClick={onToggle}
        className="lcars-sidebar-collapse"
        style={{
          flexShrink: 0,
          cursor: 'pointer',
          background: fillCap,
          border: 'none',
          color: colors.text,
          padding: '7px 6px 6px',
          fontSize: 9,
          fontFamily: 'var(--font-antonio), sans-serif',
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          opacity: 0.92,
          textAlign: 'right',
          width: '100%',
          minWidth: 0,
          alignSelf: 'stretch',
          boxSizing: 'border-box',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
        }}
        title={collapsed ? 'Expand' : 'Collapse'}
      >
        {collapsed ? '▸' : '◂ Collapse'}
      </button>
      </div>
    </div>
  );
}

function redAlertStagger(alertLevel: AlertLevel, index: number): CSSProperties {
  if (alertLevel !== 'red') return {};
  return { animationDelay: `${index * 0.06}s` };
}

function blockBase(collapsed: boolean): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    padding: collapsed ? '8px 5px 6px' : '7px 6px 6px',
    width: '100%',
    minWidth: 0,
    alignSelf: 'stretch',
    minHeight: collapsed ? 40 : 44,
    flexShrink: 0,
    borderRadius: 0,
    boxSizing: 'border-box',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 1px 0 rgba(0,0,0,0.5)',
    transition: 'background 0.25s ease, filter 0.12s',
    textAlign: 'right',
  };
}

function NavBlock({
  href,
  label,
  color,
  activeColor,
  active,
  collapsed,
  alertLevel,
  staggerIndex,
}: {
  href: string;
  label: string;
  color: string;
  activeColor: string;
  active: boolean;
  collapsed: boolean;
  alertLevel: AlertLevel;
  staggerIndex: number;
}) {
  const staggerStyle = redAlertStagger(alertLevel, staggerIndex);

  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className="lcars-nav-block lcars-chrome-item"
      style={{
        ...blockBase(collapsed),
        background: active ? activeColor : color,
        textDecoration: 'none',
        color: '#000',
        fontFamily: 'var(--font-antonio), "Helvetica Neue", sans-serif',
        fontWeight: active ? 700 : 600,
        fontSize: collapsed ? 10 : 11,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        ...staggerStyle,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.filter = 'brightness(1.12)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.filter = 'brightness(1)';
      }}
    >
      <span
        style={{
          lineHeight: 1.15,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: collapsed ? 'normal' : 'nowrap',
          maxWidth: '100%',
          minWidth: 0,
          width: '100%',
          display: 'block',
        }}
      >
        {collapsed ? collapsedLabel(label) : label}
      </span>
    </Link>
  );
}
