'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Settings, Palette, Clock, Loader2, Puzzle, Users, ChevronRight, MapPin } from 'lucide-react';

const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3000`
  : 'http://localhost:3000';

export default function SettingsPage() {
  const router = useRouter();
  const [retentionDays, setRetentionDays] = useState<number>(3);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/settings`)
      .then((r) => r.json())
      .then((data: { settings: Record<string, unknown> }) => {
        const days = data.settings.history_retention_days;
        if (typeof days === 'number') setRetentionDays(days);
      })
      .catch(() => {})
      .finally(() => setLoadingSettings(false));
  }, []);

  const saveRetention = async (days: number) => {
    setRetentionDays(days);
    setSaving(true);
    try {
      await fetch(`${API_BASE}/api/settings/history_retention_days`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: days }),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 lg:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--color-accent)', opacity: 0.15 }}>
          <Settings className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
        </div>
        <h1 className="text-lg font-semibold">Settings</h1>
      </div>

      {/* Appearance */}
      <Card
        className="cursor-pointer transition-colors hover:bg-[var(--color-bg-hover)]"
        onClick={() => router.push('/settings/appearance')}
      >
        <div className="flex items-center gap-3">
          <Palette className="h-4 w-4 shrink-0" style={{ color: 'var(--color-accent)' }} />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-medium">Appearance</h2>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Theme, color mode, and font size
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--color-text-muted)' }} />
        </div>
      </Card>

      {/* Location */}
      <Card
        className="cursor-pointer transition-colors hover:bg-[var(--color-bg-hover)]"
        onClick={() => router.push('/settings/location')}
      >
        <div className="flex items-center gap-3">
          <MapPin className="h-4 w-4 shrink-0" style={{ color: 'var(--color-accent)' }} />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-medium">Location</h2>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Set your home address and map pin
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--color-text-muted)' }} />
        </div>
      </Card>

      {/* History retention */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
          <h2 className="text-sm font-medium">History</h2>
          {saving && <Loader2 className="h-3 w-3 animate-spin" style={{ color: 'var(--color-text-muted)' }} />}
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
          How long to keep device state history. Individual devices can override this in their settings.
        </p>
        {loadingSettings ? (
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--color-text-muted)' }} />
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Default retention:</span>
            <div className="flex gap-1.5">
              {[1, 3, 7, 14, 30].map((days) => (
                <button
                  key={days}
                  onClick={() => saveRetention(days)}
                  className="rounded-md px-3 py-1 text-xs font-medium transition-colors border"
                  style={{
                    backgroundColor: retentionDays === days ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                    color: retentionDays === days ? '#fff' : 'var(--color-text-secondary)',
                    borderColor: retentionDays === days ? 'var(--color-accent)' : 'var(--color-border)',
                  }}
                >
                  {days}d
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Areas */}
      <Card
        className="cursor-pointer transition-colors hover:bg-[var(--color-bg-hover)]"
        onClick={() => router.push('/areas')}
      >
        <div className="flex items-center gap-3">
          <MapPin className="h-4 w-4 shrink-0" style={{ color: 'var(--color-accent)' }} />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-medium">Areas</h2>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Create areas and assign devices to them
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--color-text-muted)' }} />
        </div>
      </Card>

      {/* Integrations */}
      <Card
        className="cursor-pointer transition-colors hover:bg-[var(--color-bg-hover)]"
        onClick={() => router.push('/integrations')}
      >
        <div className="flex items-center gap-3">
          <Puzzle className="h-4 w-4 shrink-0" style={{ color: 'var(--color-accent)' }} />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-medium">Integrations</h2>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Manage connected services and bridges
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--color-text-muted)' }} />
        </div>
      </Card>

      {/* Manage Users */}
      <Card className="opacity-60">
        <div className="flex items-center gap-3">
          <Users className="h-4 w-4 shrink-0" style={{ color: 'var(--color-accent)' }} />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-medium">Manage Users</h2>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Add and manage user accounts
            </p>
          </div>
          <span className="text-[10px] font-medium rounded-full px-2 py-0.5" style={{ backgroundColor: 'var(--color-bg-hover)', color: 'var(--color-text-muted)' }}>
            Coming soon
          </span>
        </div>
      </Card>
    </div>
  );
}
