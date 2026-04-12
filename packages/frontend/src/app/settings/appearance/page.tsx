'use client';

import { createElement } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { ArrowLeft, Sun, Moon, Monitor, Palette, Check, Volume2, VolumeX } from 'lucide-react';
import { useTheme, type ThemeMode } from '@/providers/ThemeProvider';
import { themes } from '@/lib/themes';
import { clsx } from 'clsx';
import { useLCARSSounds } from '@/components/lcars/LCARSSounds';
import { useLCARSVariant } from '@/components/lcars/LCARSVariantProvider';
import { LCARS_PALETTES } from '@/components/lcars/colors';
import { Permission, type UiPreferenceLocks } from '@ha/shared';
import { useAuth } from '@/providers/AuthProvider';

function lockedKeysText(locks: UiPreferenceLocks): string {
  const labels: Record<string, string> = {
    colorMode: 'Color mode',
    activeTheme: 'Theme',
    fontSize: 'Font size',
    lcarsVariant: 'LCARS variant',
    lcarsSoundsEnabled: 'LCARS sounds',
  };
  return (Object.keys(locks) as (keyof UiPreferenceLocks)[])
    .filter((k) => locks[k])
    .map((k) => labels[String(k)] ?? String(k))
    .join(', ');
}
import { useSystemTerminal } from '@/providers/SystemTerminalProvider';

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
  const { hasPermission, uiPreferenceLocks, user } = useAuth();
  const lockNotice =
    user && Object.keys(uiPreferenceLocks).length > 0 ? lockedKeysText(uiPreferenceLocks) : '';
  const { showNavButton, setShowNavButton } = useSystemTerminal();
  const canConfigTerminal = hasPermission(Permission.ViewSystemTerminal);
  const { theme, setTheme, activeTheme, setActiveTheme, fontSize, setFontSize } = useTheme();
  const { enabled: soundsEnabled, setEnabled: setSoundsEnabled, play } = useLCARSSounds();
  const { variant: lcarsVariant, setVariant: setLcarsVariant } = useLCARSVariant();

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
        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' }}>
          <Palette className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
        </div>
        <h1 className="text-lg font-semibold">Appearance</h1>
      </div>

      {lockNotice && (
        <div
          className="rounded-lg border px-3 py-2 text-xs"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
            color: 'var(--color-text-secondary)',
          }}
        >
          Your administrator has set: {lockNotice}. Those options cannot be changed here.
        </div>
      )}

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
              type="button"
              disabled={!!uiPreferenceLocks.colorMode}
              onClick={() => setTheme(mode)}
              className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors border disabled:opacity-45 disabled:cursor-not-allowed"
              style={{
                backgroundColor: theme === mode ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                color: theme === mode ? '#fff' : 'var(--color-text-secondary)',
                borderColor: theme === mode ? 'var(--color-accent)' : 'var(--color-border)',
              }}
            >
              {createElement(Icon, { className: 'h-4 w-4' })}
              {label}
            </button>
          ))}
        </div>
      </Card>

      {/* System terminal shortcut — permission-based */}
      {canConfigTerminal && (
        <Card>
          <h2 className="text-sm font-medium mb-1">System terminal</h2>
          <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
            Show the sidebar control that opens the live log panel. Access to logs still follows your role permissions.
          </p>
          <button
            type="button"
            onClick={() => setShowNavButton(!showNavButton)}
            className="rounded-md px-4 py-2 text-sm font-medium transition-colors border"
            style={{
              backgroundColor: showNavButton ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
              color: showNavButton ? '#fff' : 'var(--color-text-secondary)',
              borderColor: showNavButton ? 'var(--color-accent)' : 'var(--color-border)',
            }}
          >
            {showNavButton ? 'Sidebar shortcut: on' : 'Sidebar shortcut: off'}
          </button>
        </Card>
      )}

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
              type="button"
              disabled={!!uiPreferenceLocks.fontSize}
              onClick={() => setFontSize(value)}
              className="rounded-md px-4 py-2 text-sm font-medium transition-colors border disabled:opacity-45 disabled:cursor-not-allowed"
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
                type="button"
                disabled={!!uiPreferenceLocks.activeTheme}
                onClick={() => setActiveTheme(t.id)}
                className={clsx(
                  'relative flex items-start gap-3 rounded-lg border p-3 text-left transition-colors disabled:opacity-45 disabled:cursor-not-allowed',
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
      {/* LCARS Variant — only show when LCARS theme is active */}
      {activeTheme === 'lcars' && (
        <Card>
          <h2 className="text-sm font-medium mb-1">LCARS Variant</h2>
          <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
            Select bridge aesthetic
          </p>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(LCARS_PALETTES).map(([id, palette]) => (
              <button
                key={id}
                type="button"
                disabled={!!uiPreferenceLocks.lcarsVariant}
                onClick={() => setLcarsVariant(id)}
                className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors border disabled:opacity-45 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: lcarsVariant === id ? palette.accent : 'var(--color-bg-secondary)',
                  color: lcarsVariant === id ? '#000' : 'var(--color-text-secondary)',
                  borderColor: lcarsVariant === id ? palette.accent : 'var(--color-border)',
                }}
              >
                {/* Color swatch */}
                <div className="flex gap-0.5">
                  <div className="h-3 w-3 rounded-full" style={{ background: palette.elbowTop }} />
                  <div className="h-3 w-3 rounded-full" style={{ background: palette.elbowBottom }} />
                  <div className="h-3 w-3 rounded-full" style={{ background: palette.navColors[0] }} />
                </div>
                {palette.name}
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* LCARS Sound Effects — only show when LCARS theme is active */}
      {activeTheme === 'lcars' && (
        <Card>
          <h2 className="text-sm font-medium mb-1">LCARS Sound Effects</h2>
          <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
            Enable authentic interface sounds
          </p>
          <button
            type="button"
            disabled={!!uiPreferenceLocks.lcarsSoundsEnabled}
            onClick={() => {
              const next = !soundsEnabled;
              setSoundsEnabled(next);
              if (next) play('chirp');
            }}
            className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors border disabled:opacity-45 disabled:cursor-not-allowed"
            style={{
              backgroundColor: soundsEnabled ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
              color: soundsEnabled ? '#fff' : 'var(--color-text-secondary)',
              borderColor: soundsEnabled ? 'var(--color-accent)' : 'var(--color-border)',
            }}
          >
            {soundsEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            {soundsEnabled ? 'Enabled' : 'Disabled'}
          </button>
        </Card>
      )}
    </div>
  );
}
