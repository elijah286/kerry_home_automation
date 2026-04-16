'use client';

import { useMemo, createElement } from 'react';
import { useRouter } from 'next/navigation';
import {
  Settings, Palette, Clock, Puzzle, Users, ChevronRight, MapPin, Bot, Zap,
  ToggleLeft, LayoutGrid, LayoutDashboard, HardDrive, Server, UserCircle, Download,
} from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';

interface SettingsItem {
  href: string;
  icon: React.ElementType;
  label: string;
  description: string;
  /** If true, only shown to users with the admin role */
  adminOnly?: boolean;
}

const groups: { title?: string; items: SettingsItem[] }[] = [
  {
    title: 'Display',
    items: [
      { href: '/settings/account', icon: UserCircle, label: 'My account', description: 'Profile, appearance, and sign out' },
      { href: '/settings/appearance', icon: Palette, label: 'Appearance', description: 'Theme, color mode, and font size' },
      { href: '/settings/location', icon: MapPin, label: 'Location', description: 'Set your home address and map pin' },
    ],
  },
  {
    title: 'Automation',
    items: [
      { href: '/settings/automations', icon: Zap, label: 'Automations', description: 'Create and manage automated behaviors' },
      { href: '/settings/helpers', icon: ToggleLeft, label: 'Helpers', description: 'Toggles, counters, timers, sensors, and more' },
    ],
  },
  {
    title: 'Data',
    items: [
      {
        href: '/settings/dashboards',
        icon: LayoutDashboard,
        label: 'Dashboards',
        description: 'Manage dashboards, access, and sidebar visibility',
        adminOnly: true,
      },
      { href: '/settings/history', icon: Clock, label: 'History', description: 'Retention duration and recording settings' },
      { href: '/areas', icon: LayoutGrid, label: 'Areas', description: 'Create areas and assign devices to them' },
    ],
  },
  {
    title: 'System',
    items: [
      {
        href: '/settings/system',
        icon: Server,
        label: 'System health',
        description: 'CPU, memory, disk, Docker containers, and service controls',
        adminOnly: true,
      },
      {
        href: '/settings/software-update',
        icon: Download,
        label: 'Software update',
        description: 'Check for new versions and install when you are ready',
        adminOnly: true,
      },
      { href: '/settings/llm', icon: Bot, label: 'LLM Integration', description: 'Configure AI assistant and API key' },
      { href: '/integrations', icon: Puzzle, label: 'Integrations', description: 'Manage connected services and bridges' },
      { href: '/settings/users', icon: Users, label: 'Manage Users', description: 'Add and manage user accounts' },
      { href: '/settings/server-installer', icon: HardDrive, label: 'Server Installer', description: 'Generate a bootable Ubuntu ISO pre-configured for this hub' },
    ],
  },
];

export default function SettingsPage() {
  const router = useRouter();
  const { isAdmin, loading } = useAuth();

  const visibleGroups = useMemo(
    () =>
      groups.map((group) => ({
        ...group,
        items: group.items.filter(
          (item) => !item.adminOnly || (isAdmin && !loading),
        ),
      })),
    [isAdmin, loading],
  );

  return (
    <div className="max-w-2xl mx-auto p-4 lg:p-6">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-5">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' }}
        >
          <Settings className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
        </div>
        <h1 className="text-lg font-semibold">Settings</h1>
      </div>

      <div className="space-y-4">
        {visibleGroups.map((group) => (
          <div key={group.title}>
            {group.title && (
              <p className="px-1 pb-1.5 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                {group.title}
              </p>
            )}
            <div
              className="rounded-[var(--radius)] border overflow-hidden"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-card)' }}
            >
              {group.items.map((item, i) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.href}
                    onClick={() => router.push(item.href)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--color-bg-hover)]"
                    style={i < group.items.length - 1 ? { borderBottom: '1px solid var(--color-border)' } : undefined}
                  >
                    <div
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                      style={{ background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' }}
                    >
                      {createElement(Icon, {
                        className: 'h-3.5 w-3.5',
                        style: { color: 'var(--color-accent)' },
                      })}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{item.description}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--color-text-muted)' }} />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
