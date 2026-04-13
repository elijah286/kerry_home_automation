'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Card } from '@/components/ui/Card';
import {
  MapPin, Plus, Pencil, Trash2, Loader2, ArrowLeft, Check, X, Cpu,
} from 'lucide-react';
import Link from 'next/link';

const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3000`
  : 'http://localhost:3000';

interface Area {
  id: string;
  name: string;
  createdAt: string;
}

export default function AreasPage() {
  const router = useRouter();
  const { devices } = useWebSocket();
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const loadAreas = useCallback(() => {
    fetch(`${API_BASE}/api/areas`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data: { areas: Area[] }) => setAreas(data.areas))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadAreas(); }, [loadAreas]);

  const createArea = async () => {
    const name = newName.trim();
    if (!name) return;
    await fetch(`${API_BASE}/api/areas`, { credentials: 'include',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    setNewName('');
    loadAreas();
  };

  const updateArea = async (id: string) => {
    const name = editName.trim();
    if (!name) return;
    await fetch(`${API_BASE}/api/areas/${id}`, { credentials: 'include',
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    setEditingId(null);
    loadAreas();
  };

  const deleteArea = async (id: string) => {
    await fetch(`${API_BASE}/api/areas/${id}`, { credentials: 'include', method: 'DELETE' });
    loadAreas();
  };

  const deviceCountForArea = (areaId: string) =>
    devices.filter((d) => d.userAreaId === areaId || d.areaId === areaId).length;

  return (
    <div className="max-w-3xl mx-auto p-4 lg:p-6 space-y-6">
      <Link href="/settings" className="inline-flex items-center gap-1 text-sm" style={{ color: 'var(--color-accent)' }}>
        <ArrowLeft className="h-4 w-4" /> Settings
      </Link>

      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' }}>
          <MapPin className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
        </div>
        <h1 className="text-lg font-semibold">Areas</h1>
      </div>

      {/* Create new area */}
      <Card>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="New area name..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createArea()}
            className="flex-1 rounded-md border px-3 py-1.5 text-sm"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)',
            }}
          />
          <button
            onClick={createArea}
            disabled={!newName.trim()}
            className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
            style={{
              backgroundColor: newName.trim() ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
              color: newName.trim() ? '#fff' : 'var(--color-text-muted)',
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
      </Card>

      {/* Area list */}
      {loading ? (
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--color-accent)' }} />
          <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading areas...</span>
        </div>
      ) : areas.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          No areas yet. Create one above to get started.
        </p>
      ) : (
        <div className="space-y-2">
          {areas.map((area) => {
            const count = deviceCountForArea(area.id);
            const isEditing = editingId === area.id;

            return (
              <Card key={area.id}>
                <div className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 shrink-0" style={{ color: 'var(--color-accent)' }} />

                  {isEditing ? (
                    <input
                      autoFocus
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') updateArea(area.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="flex-1 rounded-md border px-2 py-1 text-sm"
                      style={{
                        backgroundColor: 'var(--color-bg-secondary)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text)',
                      }}
                    />
                  ) : (
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => router.push(`/devices?area=${encodeURIComponent(area.id)}`)}
                    >
                      <span className="text-sm font-medium">{area.name}</span>
                      <span className="text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>
                        <Cpu className="h-3 w-3 inline mr-0.5" />
                        {count} device{count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-1">
                    {isEditing ? (
                      <>
                        <button
                          onClick={() => updateArea(area.id)}
                          className="rounded-md p-1.5 hover:bg-[var(--color-bg-hover)] transition-colors"
                        >
                          <Check className="h-3.5 w-3.5" style={{ color: 'var(--color-success)' }} />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="rounded-md p-1.5 hover:bg-[var(--color-bg-hover)] transition-colors"
                        >
                          <X className="h-3.5 w-3.5" style={{ color: 'var(--color-text-muted)' }} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => { setEditingId(area.id); setEditName(area.name); }}
                          className="rounded-md p-1.5 hover:bg-[var(--color-bg-hover)] transition-colors"
                          aria-label="Edit area"
                        >
                          <Pencil className="h-3.5 w-3.5" style={{ color: 'var(--color-text-muted)' }} />
                        </button>
                        <button
                          onClick={() => deleteArea(area.id)}
                          className="rounded-md p-1.5 hover:bg-[var(--color-bg-hover)] transition-colors"
                          aria-label="Delete area"
                        >
                          <Trash2 className="h-3.5 w-3.5" style={{ color: 'var(--color-danger)' }} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
