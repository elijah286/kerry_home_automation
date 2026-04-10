'use client';

import { Card } from '@/components/ui/Card';
import { Settings, Sun, Moon, Monitor } from 'lucide-react';
import { useTheme, type ThemeMode } from '@/providers/ThemeProvider';
import { clsx } from 'clsx';

const themeOptions: { mode: ThemeMode; icon: React.ElementType; label: string }[] = [
  { mode: 'light', icon: Sun, label: 'Light' },
  { mode: 'dark', icon: Moon, label: 'Dark' },
  { mode: 'system', icon: Monitor, label: 'System' },
];

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="max-w-3xl mx-auto p-4 lg:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--color-accent)', opacity: 0.15 }}>
          <Settings className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
        </div>
        <h1 className="text-lg font-semibold">Settings</h1>
      </div>

      {/* Appearance */}
      <Card>
        <h2 className="text-sm font-medium mb-3">Appearance</h2>
        <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
          Choose your preferred color theme
        </p>
        <div className="flex gap-2">
          {themeOptions.map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => setTheme(mode)}
              className={clsx(
                'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors border',
              )}
              style={{
                backgroundColor: theme === mode ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                color: theme === mode ? '#fff' : 'var(--color-text-secondary)',
                borderColor: theme === mode ? 'var(--color-accent)' : 'var(--color-border)',
              }}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </Card>

      {/* Future settings */}
      <Card>
        <h2 className="text-sm font-medium mb-2">General</h2>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Additional settings will appear here as features are added.
        </p>
      </Card>
    </div>
  );
}
