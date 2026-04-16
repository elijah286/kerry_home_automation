'use client';

import { createElement, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import {
  LayoutDashboard,
  Cpu,
  Camera,
  CookingPot,
  AlarmClock,
  CalendarDays,
  MapPin,
  Settings,
  User,
  PanelLeftClose,
  PanelLeftOpen,
  Terminal,
  X,
} from 'lucide-react';
import type { DashboardDoc } from '@ha/shared';
import { useAuth } from '@/providers/AuthProvider';
import { useSystemTerminal } from '@/providers/SystemTerminalProvider';
import { listDashboards } from '@/lib/api-dashboards';
import { HeaderToolbar } from './HeaderToolbar';

const mainNavItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/devices', label: 'Devices', icon: Cpu },
  { href: '/cameras', label: 'Cameras', icon: Camera },
  { href: '/recipes', label: 'Recipes', icon: CookingPot },
  { href: '/alarms', label: 'Alarms', icon: AlarmClock },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/locations', label: 'Locations', icon: MapPin },
];

const settingsItem = { href: '/settings', label: 'Settings', icon: Settings };

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={collapsed ? label : undefined}
      className={clsx(
        'flex items-center rounded-lg py-2 text-sm font-medium transition-colors',
        collapsed ? 'justify-center px-2' : 'gap-3 px-3',
      )}
      style={{
        color: active ? 'var(--color-sidebar-text-active)' : 'var(--color-sidebar-text)',
        backgroundColor: active ? 'var(--color-sidebar-active-bg)' : 'transparent',
      }}
    >
      {createElement(Icon, { className: 'h-5 w-5 shrink-0' })}
      {!collapsed && label}
    </Link>
  );
}

export function Sidebar({
  connected,
  collapsed,
  onToggle,
  mobileOpen,
  onCloseMobile,
}: {
  connected: boolean;
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const pathname = usePathname();
  const { user, isAdmin } = useAuth();
  const { canUse: canUseTerminal, showNavButton, open: terminalOpen, setOpen: setTerminalOpen } =
    useSystemTerminal();
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  // Sidebar-visible dashboards. Backend already visibility-filters the list per
  // session role/userId; we just drop ones flagged hiddenFromSidebar.
  const [dashboards, setDashboards] = useState<DashboardDoc[]>([]);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    listDashboards()
      .then((docs) => {
        if (cancelled) return;
        setDashboards(docs.filter((d) => !d.hiddenFromSidebar));
      })
      .catch(() => { /* non-fatal: sidebar falls back to static nav */ });
    return () => { cancelled = true; };
  }, [user]);

  return (
    <>
      {/* ── Mobile slide-out drawer ── */}
      <div
        className={clsx(
          'fixed inset-0 z-50 md:hidden',
          mobileOpen ? '' : 'pointer-events-none',
        )}
      >
        {/* Backdrop */}
        <div
          className={clsx(
            'absolute inset-0 bg-black/50 transition-opacity duration-300',
            mobileOpen ? 'opacity-100' : 'opacity-0',
          )}
          onClick={onCloseMobile}
          aria-hidden
        />
        {/* Drawer panel */}
        <aside
          className={clsx(
            'absolute inset-y-0 left-0 flex flex-col w-72 max-w-[85vw] shadow-2xl transition-transform duration-300 ease-in-out',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}
          style={{ backgroundColor: 'var(--color-sidebar-bg)' }}
        >
          {/* Drawer header */}
          <div
            className="flex h-14 items-center gap-2 px-3 border-b shrink-0"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: connected ? 'var(--color-success)' : 'var(--color-danger)' }}
            />
            <span className="flex-1 text-sm font-semibold truncate" style={{ color: 'var(--color-sidebar-text-active)' }}>
              HomeOS
            </span>
            <button
              onClick={onCloseMobile}
              className="rounded-lg p-1.5 transition-colors hover:bg-white/10"
              style={{ color: 'var(--color-sidebar-text)' }}
              aria-label="Close navigation menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Nav (always expanded on mobile) */}
          <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
            {mainNavItems.map((item) => (
              <NavLink key={item.href} {...item} active={isActive(item.href)} collapsed={false} />
            ))}
            {dashboards.length > 0 && (
              <>
                <p
                  className="pt-4 px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-sidebar-text)', opacity: 0.6 }}
                >
                  Dashboards
                </p>
                {dashboards.map((d) => (
                  <NavLink
                    key={d.id}
                    href={`/dashboards/${d.path}`}
                    label={d.title}
                    icon={LayoutDashboard}
                    active={pathname === `/dashboards/${d.path}`}
                    collapsed={false}
                  />
                ))}
              </>
            )}
          </nav>

          <div
            className="shrink-0 border-t px-3 py-3 md:hidden"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <HeaderToolbar layout="drawer" />
          </div>

          {/* Footer */}
          <div className="px-2 pb-4 space-y-1">
            {isAdmin && <NavLink {...settingsItem} active={isActive(settingsItem.href)} collapsed={false} />}
            {user && (
              <NavLink
                href="/settings/account"
                label={user.displayName}
                icon={User}
                active={pathname.startsWith('/settings/account')}
                collapsed={false}
              />
            )}
          </div>
        </aside>
      </div>

      {/* ── Desktop sidebar (unchanged) ── */}
      <aside
        className={clsx(
          'hidden md:flex md:flex-col md:fixed md:inset-y-0 transition-[width] duration-200 ease-in-out',
          collapsed ? 'md:w-14' : 'md:w-56',
        )}
        style={{ backgroundColor: 'var(--color-sidebar-bg)' }}
      >
        {/* Header */}
        <div
          className={clsx(
            'flex h-14 items-center border-b shrink-0',
            collapsed ? 'justify-center px-2' : 'gap-2 px-3',
          )}
          style={{ borderColor: 'var(--color-border)' }}
        >
          {!collapsed && (
            <>
              <div
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: connected ? 'var(--color-success)' : 'var(--color-danger)' }}
              />
              <span className="flex-1 text-sm font-semibold truncate" style={{ color: 'var(--color-sidebar-text-active)' }}>
                HomeOS
              </span>
            </>
          )}
          <button
            onClick={onToggle}
            className="rounded-lg p-1.5 transition-colors hover:bg-white/10"
            style={{ color: 'var(--color-sidebar-text)' }}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
          </button>
        </div>

        {/* Main nav */}
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          {mainNavItems.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(item.href)} collapsed={collapsed} />
          ))}
          {dashboards.length > 0 && (
            <>
              {!collapsed && (
                <p
                  className="pt-4 px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-sidebar-text)', opacity: 0.6 }}
                >
                  Dashboards
                </p>
              )}
              {collapsed && <div className="pt-2" aria-hidden />}
              {dashboards.map((d) => (
                <NavLink
                  key={d.id}
                  href={`/dashboards/${d.path}`}
                  label={d.title}
                  icon={LayoutDashboard}
                  active={pathname === `/dashboards/${d.path}`}
                  collapsed={collapsed}
                />
              ))}
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="px-2 pb-4 space-y-1">
          {isAdmin && <NavLink {...settingsItem} active={isActive(settingsItem.href)} collapsed={collapsed} />}
          {user && (
            <NavLink
              href="/settings/account"
              label={user.displayName}
              icon={User}
              active={pathname.startsWith('/settings/account')}
              collapsed={collapsed}
            />
          )}
        </div>
      </aside>
    </>
  );
}
