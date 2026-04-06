'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Lightbulb,
  ToggleRight,
  Thermometer,
  Fan as FanIcon,
  Blinds,
  Music,
  Activity,
  Radio,
  Camera,
  Layers,
  Loader2,
  Home,
} from 'lucide-react';
import { fetchAreas, fetchEntities } from '@/lib/api';
import { useWebSocket } from '@/providers/WebSocketProvider';
import { getWebSocketClient } from '@/lib/ws';
import { LightCard } from '@/components/entities/LightCard';
import { ClimateCard } from '@/components/entities/ClimateCard';
import { CoverCard } from '@/components/entities/CoverCard';
import { MediaPlayerCard } from '@/components/entities/MediaPlayerCard';
import { EntityCard } from '@/components/entities/EntityCard';
import { FanCard } from '@/components/entities/FanCard';
import { SensorCard } from '@/components/entities/SensorCard';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { AreaWithFloor, EntityState } from '@/types';
import type { LucideIcon } from 'lucide-react';

interface DomainSection {
  key: string;
  title: string;
  icon: LucideIcon;
  entities: EntityState[];
}

function groupEntitiesByDomain(entities: EntityState[]): DomainSection[] {
  const buckets: Record<string, EntityState[]> = {};

  for (const entity of entities) {
    const domain = entity.domain || entity.entity_id.split('.')[0];

    let bucket: string;
    switch (domain) {
      case 'light':
        bucket = 'lights';
        break;
      case 'switch':
      case 'input_boolean':
        bucket = 'switches';
        break;
      case 'climate':
        bucket = 'climate';
        break;
      case 'fan':
        bucket = 'fans';
        break;
      case 'cover':
        bucket = 'covers';
        break;
      case 'media_player':
        bucket = 'media_player';
        break;
      case 'sensor':
        bucket = 'sensors';
        break;
      case 'binary_sensor':
        bucket = 'binary_sensors';
        break;
      case 'camera':
        bucket = 'cameras';
        break;
      default:
        bucket = 'other';
        break;
    }

    if (!buckets[bucket]) buckets[bucket] = [];
    buckets[bucket].push(entity);
  }

  const sectionMeta: Record<string, { title: string; icon: LucideIcon; order: number }> = {
    lights: { title: 'Lights', icon: Lightbulb, order: 0 },
    switches: { title: 'Switches', icon: ToggleRight, order: 1 },
    climate: { title: 'Climate', icon: Thermometer, order: 2 },
    fans: { title: 'Fans', icon: FanIcon, order: 3 },
    covers: { title: 'Covers', icon: Blinds, order: 4 },
    media_player: { title: 'Media', icon: Music, order: 5 },
    sensors: { title: 'Sensors', icon: Activity, order: 6 },
    binary_sensors: { title: 'Binary Sensors', icon: Radio, order: 7 },
    cameras: { title: 'Cameras', icon: Camera, order: 8 },
    other: { title: 'Other', icon: Layers, order: 9 },
  };

  return Object.entries(buckets)
    .map(([key, ents]) => ({
      key,
      title: sectionMeta[key]?.title ?? key,
      icon: sectionMeta[key]?.icon ?? Layers,
      entities: ents,
      _order: sectionMeta[key]?.order ?? 99,
    }))
    .sort((a, b) => a._order - b._order)
    .map(({ _order: _, ...rest }) => rest);
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="animate-pulse h-24" padding="md">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-white/5" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-28 rounded bg-white/5" />
              <div className="h-2.5 w-16 rounded bg-white/5" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function renderEntityCard(section: string, entity: EntityState) {
  const id = entity.entity_id;
  switch (section) {
    case 'lights':
      return <LightCard key={id} entityId={id} />;
    case 'switches':
      return <EntityCard key={id} entityId={id} />;
    case 'climate':
      return <ClimateCard key={id} entityId={id} />;
    case 'fans':
      return <FanCard key={id} entityId={id} />;
    case 'covers':
      return <CoverCard key={id} entityId={id} />;
    case 'media_player':
      return <MediaPlayerCard key={id} entityId={id} />;
    case 'sensors':
      return <SensorCard key={id} entityId={id} />;
    case 'binary_sensors':
      return <EntityCard key={id} entityId={id} />;
    case 'cameras':
      return <EntityCard key={id} entityId={id} icon={Camera} />;
    default:
      return <EntityCard key={id} entityId={id} />;
  }
}

export default function RoomDetailPage() {
  const params = useParams();
  const areaId = params.areaId as string;

  const { store } = useWebSocket();

  const [area, setArea] = useState<AreaWithFloor | null>(null);
  const [entities, setEntities] = useState<EntityState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [areasRes, entitiesRes] = await Promise.all([
        fetchAreas(),
        fetchEntities({ area_id: areaId }),
      ]);
      const match = areasRes.areas.find((a) => a.id === areaId) ?? null;
      setArea(match);
      setEntities(entitiesRes.entities);

      if (entitiesRes.entities.length > 0) {
        store.mergeStates(entitiesRes.entities);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load room data');
    } finally {
      setLoading(false);
    }
  }, [areaId, store]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    let cancelled = false;
    const client = getWebSocketClient();

    (async () => {
      try {
        const states = await client.subscribeAreas([areaId]);
        if (!cancelled && states.length > 0) {
          store.mergeStates(states);
        }
      } catch {
        // WebSocket subscription failures are non-critical; REST data is already loaded
      }
    })();

    return () => { cancelled = true; };
  }, [areaId, store]);

  const sections = useMemo(() => groupEntitiesByDomain(entities), [entities]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/rooms"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200 transition-all active:scale-90"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="space-y-2">
              <div className="h-6 w-40 animate-pulse rounded bg-white/5" />
              <div className="h-4 w-24 animate-pulse rounded bg-white/5" />
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-foreground truncate">
                {area?.name ?? 'Room'}
              </h1>
              {area?.floor && (
                <Badge size="sm" className="mt-1">
                  {area.floor.name}
                </Badge>
              )}
            </>
          )}
        </div>
      </div>

      {error && (
        <Card padding="lg">
          <p className="text-sm text-red-400">{error}</p>
        </Card>
      )}

      {loading && <SkeletonGrid />}

      {!loading && !error && entities.length === 0 && (
        <Card padding="lg">
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Home size={32} className="text-muted" />
            <p className="text-sm text-muted">No entities found in this room</p>
          </div>
        </Card>
      )}

      {!loading &&
        sections.map((section) => {
          const SectionIcon = section.icon;
          return (
            <section key={section.key} className="space-y-3">
              <div className="flex items-center gap-2">
                <SectionIcon size={16} strokeWidth={1.8} className="text-muted" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
                  {section.title}
                </h2>
                <span className="text-xs text-zinc-600">{section.entities.length}</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {section.entities.map((entity) => renderEntityCard(section.key, entity))}
              </div>
            </section>
          );
        })}
    </div>
  );
}
