'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import {
  Zap, Plus, Trash2, Copy, Play, Search, ChevronDown, ChevronRight,
  Clock, Cpu, Sun, Hand, Loader2, Pencil, AlertTriangle, FileCode,
} from 'lucide-react';
import {
  getAutomations, deleteAutomation, toggleAutomation, triggerAutomation, duplicateAutomation,
  getDevices,
} from '@/lib/api';
import type { Automation, AutomationTrigger, AutomationCondition, AutomationAction } from '@ha/shared';
import { Select } from '@/components/ui/Select';

/** Recursively extract all deviceId references from an automation */
function extractDeviceIds(automation: Automation): string[] {
  const ids: string[] = [];
  const addFromTriggers = (triggers: AutomationTrigger[]) => {
    for (const t of triggers) {
      if (t.type === 'device_state') ids.push(t.deviceId);
    }
  };
  const addFromConditions = (conditions: AutomationCondition[]) => {
    for (const c of conditions) {
      if (c.type === 'device_state') ids.push(c.deviceId);
      else if (c.type === 'and' || c.type === 'or') addFromConditions(c.conditions);
      else if (c.type === 'not') addFromConditions([c.condition]);
    }
  };
  const addFromActions = (actions: AutomationAction[]) => {
    for (const a of actions) {
      if (a.type === 'device_command') ids.push(a.deviceId);
      else if (a.type === 'condition') {
        addFromConditions([a.condition]);
        addFromActions(a.then);
        if (a.else) addFromActions(a.else);
      }
    }
  };
  addFromTriggers(automation.triggers);
  addFromConditions(automation.conditions);
  addFromActions(automation.actions);
  return ids.filter(id => id.length > 0);
}

function hasDeviceProblems(automation: Automation, knownDevices: Set<string>): boolean {
  if (knownDevices.size === 0) return false; // devices not loaded yet
  const refs = extractDeviceIds(automation);
  return refs.some(id => !knownDevices.has(id));
}

function triggerIcon(type: string) {
  switch (type) {
    case 'time': return Clock;
    case 'device_state': return Cpu;
    case 'sun': return Sun;
    case 'manual': return Hand;
    default: return Zap;
  }
}

function triggerLabel(type: string): string {
  switch (type) {
    case 'time': return 'Time';
    case 'device_state': return 'Device';
    case 'sun': return 'Sun';
    case 'manual': return 'Manual';
    default: return type;
  }
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function AutomationsPage() {
  const router = useRouter();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'name' | 'lastTriggered'>('name');
  const [knownDevices, setKnownDevices] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const [{ automations: list }, { devices }] = await Promise.all([
        getAutomations(),
        getDevices(),
      ]);
      setAutomations(list);
      setKnownDevices(new Set(devices.map(d => d.id)));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = automations.filter(a =>
    !search || a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.group ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (a.description ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'lastTriggered') {
      const at = a.lastTriggered ? new Date(a.lastTriggered).getTime() : 0;
      const bt = b.lastTriggered ? new Date(b.lastTriggered).getTime() : 0;
      return bt - at;
    }
    return a.name.localeCompare(b.name);
  });

  // Group automations
  const groups = new Map<string, Automation[]>();
  for (const a of sorted) {
    const g = a.group ?? 'Ungrouped';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(a);
  }

  const toggleGroup = (g: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      const { automation } = await toggleAutomation(id, enabled);
      setAutomations(prev => prev.map(a => a.id === id ? automation : a));
    } catch { /* ignore */ }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this automation?')) return;
    try {
      await deleteAutomation(id);
      setAutomations(prev => prev.filter(a => a.id !== id));
    } catch { /* ignore */ }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const { automation } = await duplicateAutomation(id);
      setAutomations(prev => [...prev, automation]);
    } catch { /* ignore */ }
  };

  const handleTrigger = async (id: string) => {
    try {
      await triggerAutomation(id);
    } catch { /* ignore */ }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' }}>
            <Zap className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Automations</h1>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {automations.length} automation{automations.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/settings/automations/editor')}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors"
            style={{ backgroundColor: 'var(--color-bg-hover)', color: 'var(--color-text)' }}
          >
            <FileCode className="h-3.5 w-3.5" />
            YAML Editor
          </button>
          <button
            onClick={() => router.push('/settings/automations/new')}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-white transition-colors"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            <Plus className="h-3.5 w-3.5" />
            New Automation
          </button>
        </div>
      </div>

      {/* Search & Sort */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--color-text-muted)' }} />
          <input
            type="text"
            placeholder="Search automations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border py-2 pl-8 pr-3 text-xs"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)',
            }}
          />
        </div>
        <Select
          value={sortBy}
          onValueChange={(v) => setSortBy(v as typeof sortBy)}
          options={[
            { value: 'name', label: 'Sort by Name' },
            { value: 'lastTriggered', label: 'Sort by Last Run' },
          ]}
          size="xs"
        />
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--color-text-muted)' }} />
        </div>
      )}

      {/* Empty state */}
      {!loading && automations.length === 0 && (
        <Card>
          <div className="text-center py-8">
            <Zap className="h-8 w-8 mx-auto mb-3" style={{ color: 'var(--color-text-muted)' }} />
            <p className="text-sm font-medium">No automations yet</p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              Create your first automation to get started
            </p>
          </div>
        </Card>
      )}

      {/* Grouped list */}
      {!loading && Array.from(groups.entries()).map(([groupName, items]) => (
        <div key={groupName} className="space-y-1">
          {/* Group header */}
          <button
            onClick={() => toggleGroup(groupName)}
            className="flex items-center gap-2 px-1 py-1 text-xs font-medium w-full text-left"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {collapsedGroups.has(groupName) ? (
              <ChevronRight className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            {groupName}
            <span className="text-[10px]">({items.length})</span>
          </button>

          {/* Automation cards */}
          {!collapsedGroups.has(groupName) && items.map(a => (
            <Card key={a.id} className="!p-3">
              <div className="flex items-center gap-3">
                {/* Enable toggle */}
                <button
                  onClick={() => handleToggle(a.id, !a.enabled)}
                  className="relative h-5 w-9 rounded-full transition-colors shrink-0"
                  style={{
                    backgroundColor: a.enabled ? 'var(--color-accent)' : 'var(--color-bg-hover)',
                  }}
                >
                  <span
                    className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform"
                    style={{ left: a.enabled ? '18px' : '2px' }}
                  />
                </button>

                {/* Info */}
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => router.push(`/settings/automations/${a.id}`)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate" style={{ opacity: a.enabled ? 1 : 0.5 }}>
                      {a.name}
                    </span>
                    {hasDeviceProblems(a, knownDevices) && (
                      <span
                        className="flex items-center gap-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{ backgroundColor: 'var(--color-danger)', color: '#fff' }}
                        title="One or more device IDs not found"
                      >
                        <AlertTriangle className="h-2.5 w-2.5" />
                        Problem!
                      </span>
                    )}
                    {/* Trigger type icons */}
                    <div className="flex items-center gap-1">
                      {[...new Set(a.triggers.map(t => t.type))].map(type => {
                        const Icon = triggerIcon(type);
                        return (
                          <span key={type} title={triggerLabel(type)}>
                            <Icon className="h-3 w-3" style={{ color: 'var(--color-text-muted)' }} />
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  {a.description && (
                    <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
                      {a.description}
                    </p>
                  )}
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    {a.actions.length} action{a.actions.length !== 1 ? 's' : ''} &middot; Last run: {relativeTime(a.lastTriggered)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleTrigger(a.id)}
                    className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-bg-hover)]"
                    title="Run now"
                  >
                    <Play className="h-3.5 w-3.5" style={{ color: 'var(--color-accent)' }} />
                  </button>
                  <button
                    onClick={() => router.push(`/settings/automations/${a.id}`)}
                    className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-bg-hover)]"
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" style={{ color: 'var(--color-text-muted)' }} />
                  </button>
                  <button
                    onClick={() => handleDuplicate(a.id)}
                    className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-bg-hover)]"
                    title="Duplicate"
                  >
                    <Copy className="h-3.5 w-3.5" style={{ color: 'var(--color-text-muted)' }} />
                  </button>
                  <button
                    onClick={() => handleDelete(a.id)}
                    className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-bg-hover)]"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" style={{ color: 'var(--color-danger)' }} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
}
