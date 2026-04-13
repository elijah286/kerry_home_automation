'use client';

import { createElement } from 'react';
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
} from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';
import { useSystemTerminal } from '@/providers/SystemTerminalProvider';

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
      title={collapsed ? label : undefined}
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
}: {
  connected: boolean;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const { user, isAdmin } = useAuth();
  const { canUse: canUseTerminal, showNavButton, open: terminalOpen, setOpen: setTerminalOpen } =
    useSystemTerminal();
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
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
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-5 w-5" />
          ) : (
            <PanelLeftClose className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-hidden">
        {mainNavItems.map((item) => (
          <NavLink key={item.href} {...item} active={isActive(item.href)} collapsed={collapsed} />
        ))}
      </nav>

      {/* Footer */}
      <div className="px-2 pb-4 space-y-1">
        {/* System log button moved to header bar */}

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
  );
}
