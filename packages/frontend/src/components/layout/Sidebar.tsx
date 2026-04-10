'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import {
  LayoutDashboard,
  Cpu,
  Puzzle,
  Camera,
  CookingPot,
  Settings,
} from 'lucide-react';

const mainNavItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/devices', label: 'Devices', icon: Cpu },
  { href: '/cameras', label: 'Cameras', icon: Camera },
  { href: '/recipes', label: 'Recipes', icon: CookingPot },
  { href: '/integrations', label: 'Integrations', icon: Puzzle },
];

const settingsItem = { href: '/settings', label: 'Settings', icon: Settings };

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: React.ElementType; active: boolean }) {
  return (
    <Link
      href={href}
      className={clsx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors')}
      style={{
        color: active ? 'var(--color-sidebar-text-active)' : 'var(--color-sidebar-text)',
        backgroundColor: active ? 'var(--color-sidebar-active-bg)' : 'transparent',
      }}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </Link>
  );
}

export function Sidebar({ connected }: { connected: boolean }) {
  const pathname = usePathname();
  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <aside
      className="hidden md:flex md:w-56 md:flex-col md:fixed md:inset-y-0"
      style={{ backgroundColor: 'var(--color-sidebar-bg)' }}
    >
      <div className="flex h-14 items-center gap-2 px-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <div
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: connected ? 'var(--color-success)' : 'var(--color-danger)' }}
        />
        <span className="text-sm font-semibold" style={{ color: 'var(--color-sidebar-text-active)' }}>
          Home Automation
        </span>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-1">
        {mainNavItems.map((item) => (
          <NavLink key={item.href} {...item} active={isActive(item.href)} />
        ))}
      </nav>

      <div className="px-2 pb-4">
        <NavLink {...settingsItem} active={isActive(settingsItem.href)} />
      </div>
    </aside>
  );
}
