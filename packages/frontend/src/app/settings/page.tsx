'use client';

import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Settings, Palette, Clock, Puzzle, Users, ChevronRight, MapPin, Bot, Zap, ToggleLeft } from 'lucide-react';


export default function SettingsPage() {
  const router = useRouter();

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

      {/* Automations */}
      <Card
        className="cursor-pointer transition-colors hover:bg-[var(--color-bg-hover)]"
        onClick={() => router.push('/settings/automations')}
      >
        <div className="flex items-center gap-3">
          <Zap className="h-4 w-4 shrink-0" style={{ color: 'var(--color-accent)' }} />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-medium">Automations</h2>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Create and manage automated behaviors
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--color-text-muted)' }} />
        </div>
      </Card>

      {/* Helpers */}
      <Card
        className="cursor-pointer transition-colors hover:bg-[var(--color-bg-hover)]"
        onClick={() => router.push('/settings/helpers')}
      >
        <div className="flex items-center gap-3">
          <ToggleLeft className="h-4 w-4 shrink-0" style={{ color: 'var(--color-accent)' }} />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-medium">Helpers</h2>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Create virtual devices — toggles, counters, timers, sensors, and more
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--color-text-muted)' }} />
        </div>
      </Card>

      {/* History */}
      <Card
        className="cursor-pointer transition-colors hover:bg-[var(--color-bg-hover)]"
        onClick={() => router.push('/settings/history')}
      >
        <div className="flex items-center gap-3">
          <Clock className="h-4 w-4 shrink-0" style={{ color: 'var(--color-accent)' }} />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-medium">History</h2>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Retention duration and recording settings
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--color-text-muted)' }} />
        </div>
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

      {/* LLM Integration */}
      <Card
        className="cursor-pointer transition-colors hover:bg-[var(--color-bg-hover)]"
        onClick={() => router.push('/settings/llm')}
      >
        <div className="flex items-center gap-3">
          <Bot className="h-4 w-4 shrink-0" style={{ color: 'var(--color-accent)' }} />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-medium">LLM Integration</h2>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Configure AI assistant and API key
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
      <Card
        className="cursor-pointer transition-colors hover:bg-[var(--color-bg-hover)]"
        onClick={() => router.push('/settings/users')}
      >
        <div className="flex items-center gap-3">
          <Users className="h-4 w-4 shrink-0" style={{ color: 'var(--color-accent)' }} />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-medium">Manage Users</h2>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Add and manage user accounts
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--color-text-muted)' }} />
        </div>
      </Card>
    </div>
  );
}
