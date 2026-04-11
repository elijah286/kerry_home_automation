'use client';

import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { ArrowLeft, Sun, Moon, Monitor, Palette, Check } from 'lucide-react';
import { useTheme, type ThemeMode } from '@/providers/ThemeProvider';
import { themes } from '@/lib/themes';
import { clsx } from 'clsx';

const modeOptions: { mode: ThemeMode; icon: React.ElementType; label: string }[] = [
  { mode: 'light', icon: Sun, label: 'Light' },
  { mode: 'dark', icon: Moon, label: 'Dark' },
  { mode: 'system', icon: Monitor, label: 'System' },
];

const fontSizes = [
  { value: 13, label: 'Small' },
  { value: 14, label: 'Default' },
  { value: 16, label: 'Large' },
  { value: 18, label: 'Extra Large' },
];

export default function AppearancePage() {
  const router = useRouter();
  const { theme, setTheme, activeTheme, setActiveTheme, fontSize, setFontSize } = useTheme();

  return (
    <div className="max-w-3xl mx-auto p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/settings')}
          className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
          style={{ backgroundColor: 'var(--color-bg-secondary)' }}
        >
          <ArrowLeft className="h-4 w-4" style={{ color: 'var(--color-text-secondary)' }} />
        </button>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--color-accent)', opacity: 0.15 }}>
          <Palette className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
        </div>
        <h1 className="text-lg font-semibold">Appearance</h1>
      </div>

      {/* Color Mode */}
      <Card>
        <h2 className="text-sm font-medium mb-1">Mode</h2>
        <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
          Choose light, dark, or match your system
        </p>
        <div className="flex gap-2">
          {modeOptions.map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => setTheme(mode)}
              className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors border"
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

      {/* Font Size */}
      <Card>
        <h2 className="text-sm font-medium mb-1">Font Size</h2>
        <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
          Adjust the base text size across the interface
        </p>
        <div className="flex gap-2">
          {fontSizes.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFontSize(value)}
              className="rounded-md px-4 py-2 text-sm font-medium transition-colors border"
              style={{
                backgroundColor: fontSize === value ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                color: fontSize === value ? '#fff' : 'var(--color-text-secondary)',
                borderColor: fontSize === value ? 'var(--color-accent)' : 'var(--color-border)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>

      {/* Theme */}
      <Card>
        <h2 className="text-sm font-medium mb-1">Theme</h2>
        <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
          Change the overall look and feel
        </p>
        <div className="grid grid-cols-2 gap-3">
          {themes.map((t) => {
            const isActive = activeTheme === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTheme(t.id)}
                className={clsx(
                  'relative flex items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                )}
                style={{
                  borderColor: isActive ? 'var(--color-accent)' : 'var(--color-border)',
                  backgroundColor: 'var(--color-bg-secondary)',
                }}
              >
                {/* Color preview swatches */}
                <div className="flex flex-col gap-1 shrink-0 pt-0.5">
                  {t.preview.map((color, i) => (
                    <div
                      key={i}
                      className="h-3 w-3 rounded-full border"
                      style={{ backgroundColor: color, borderColor: 'var(--color-border)' }}
                    />
                  ))}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{t.name}</div>
                  <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{t.description}</div>
                </div>
                {isActive && (
                  <div
                    className="absolute top-2 right-2 h-5 w-5 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: 'var(--color-accent)' }}
                  >
                    <Check className="h-3 w-3 text-white" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
