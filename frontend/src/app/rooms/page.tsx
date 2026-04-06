'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Home, LayoutGrid, ChevronRight, Loader2 } from 'lucide-react';
import { fetchAreas } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { AreaWithFloor } from '@/types';

const FLOOR_ORDER = ['Main Floor', 'Upstairs', 'Outdoors', 'Technology', 'Attic'];

function floorSortKey(name: string): number {
  const idx = FLOOR_ORDER.indexOf(name);
  return idx >= 0 ? idx : FLOOR_ORDER.length;
}

export default function RoomsPage() {
  const [areas, setAreas] = useState<AreaWithFloor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAreas()
      .then((res) => {
        if (!cancelled) {
          setAreas(res.areas);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load rooms');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, AreaWithFloor[]>();
    for (const area of areas) {
      const floorName = area.floor?.name ?? 'Other';
      const list = map.get(floorName) ?? [];
      list.push(area);
      map.set(floorName, list);
    }
    return [...map.entries()].sort(
      ([a], [b]) => floorSortKey(a) - floorSortKey(b),
    );
  }, [areas]);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15">
          <LayoutGrid size={20} strokeWidth={1.8} className="text-accent" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Rooms</h1>
          {!loading && (
            <p className="text-sm text-muted">
              {areas.length} room{areas.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="animate-spin text-muted" />
        </div>
      )}

      {error && (
        <Card padding="lg">
          <p className="text-sm text-red-400">{error}</p>
        </Card>
      )}

      {!loading && !error && areas.length === 0 && (
        <Card padding="lg">
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Home size={32} className="text-muted" />
            <p className="text-sm text-muted">No rooms found</p>
          </div>
        </Card>
      )}

      {!loading &&
        grouped.map(([floorName, floorAreas]) => (
          <section key={floorName} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
              {floorName}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {floorAreas.map((area) => (
                <Link key={area.id} href={`/rooms/${area.id}`}>
                  <Card hoverable className="group" padding="md">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5">
                        <Home size={18} strokeWidth={1.8} className="text-zinc-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-200 truncate">
                          {area.name}
                        </p>
                        {area.floor && (
                          <Badge size="sm" className="mt-1">
                            {area.floor.name}
                          </Badge>
                        )}
                      </div>
                      <ChevronRight
                        size={16}
                        className="shrink-0 text-zinc-600 transition-transform group-hover:translate-x-0.5"
                      />
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}
