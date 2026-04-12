'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Cpu,
  Camera,
  CookingPot,
  AlarmClock,
  CalendarDays,
  MapPin,
  Puzzle,
  Settings,
  User,
} from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';

const navItems = [
  { href: '/', label: 'Home', icon: LayoutDashboard },
  { href: '/devices', label: 'Devices', icon: Cpu },
  { href: '/cameras', label: 'Cameras', icon: Camera },
  { href: '/alarms', label: 'Alarms', icon: AlarmClock },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/locations', label: 'Map', icon: MapPin },
  { href: '/settings/account', label: 'Account', icon: User },
  { href: '/settings', label: 'Settings', icon: Settings, adminOnly: true },
];

export function BottomNav() {
  const pathname = usePathname();
  const { isAdmin } = useAuth();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex md:hidden border-t"
      style={{ backgroundColor: 'var(--color-sidebar-bg)', borderColor: 'var(--color-border)' }}
    >
      {navItems.filter((item) => !('adminOnly' in item && item.adminOnly) || isAdmin).map(({ href, label, icon: Icon }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]"
            style={{
              color: active ? 'var(--color-accent)' : 'var(--color-sidebar-text)',
            }}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
