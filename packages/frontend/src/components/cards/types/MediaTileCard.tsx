'use client';

// ---------------------------------------------------------------------------
// MediaTileCard — media player / music player tile.
//
// Handles two distinct underlying device shapes:
//   - `media_player` (Yamaha MusicCast): power, volume, mute, source
//   - `music_player` (Spotify/generic): play/pause, skip, volume, shuffle,
//     repeat, + now-playing artwork
//
// The card descriptor's `controls` array filters which controls show. The
// default (no array) shows everything the device supports.
// ---------------------------------------------------------------------------

import type {
  MediaTileCard as MediaTileCardDescriptor,
  MediaPlayerState,
  MusicPlayerState,
  DeviceState,
} from '@ha/shared';
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Power } from 'lucide-react';
import { useDevice } from '@/hooks/useDevice';
import { useCommand } from '@/hooks/useCommand';
import { token } from '@/lib/tokens';
import { Select } from '@/components/ui/Select';
import { ThrottledSlider } from '@/components/ui/ThrottledSlider';
import { withEntityBoundary } from '../EntityBoundary';

type ControlKey = NonNullable<MediaTileCardDescriptor['controls']>[number];

export function MediaTileCard({ card }: { card: MediaTileCardDescriptor }) {
  const device = useDevice(card.entity);
  return withEntityBoundary(card.entity, device, (d) => {
    if (d.type === 'media_player') return <MediaPlayerBody card={card} device={d} />;
    if (d.type === 'music_player') return <MusicPlayerBody card={card} device={d} />;
    return <GenericMediaFallback card={card} device={d} />;
  }, { title: card.name });
}

function hasControl(card: MediaTileCardDescriptor, key: ControlKey): boolean {
  return !card.controls || card.controls.includes(key);
}

// ---------------------------------------------------------------------------
// Yamaha MusicCast-style media player
// ---------------------------------------------------------------------------

function MediaPlayerBody({ card, device }: { card: MediaTileCardDescriptor; device: MediaPlayerState }) {
  const { send, isPending } = useCommand(device.id);
  const label = card.name ?? device.displayName ?? device.name;
  const isOn = device.power === 'on';

  return (
    <div
      className="flex flex-col gap-2 rounded-lg p-3"
      style={{
        background: token('--color-bg-card'),
        color: token('--color-text'),
        border: `1px solid ${token('--color-border')}`,
        opacity: isOn ? 1 : 0.8,
      }}
      data-card-type="media-tile"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{label}</span>
        {hasControl(card, 'power') && (
          <button
            type="button"
            onClick={() => send('power', {
              type: 'media_player',
              action: isOn ? 'power_off' : 'power_on',
            })}
            disabled={isPending('power')}
            title={isOn ? 'Turn off' : 'Turn on'}
            className="rounded p-1"
            style={{ color: isOn ? token('--color-success') : token('--color-text-muted') }}
          >
            <Power className="h-4 w-4" />
          </button>
        )}
      </div>

      {hasControl(card, 'source') && device.sourceList.length > 0 && (
        <Select
          value={device.source}
          disabled={isPending('source') || !isOn}
          onValueChange={(v) => send('source', { type: 'media_player', action: 'set_source', source: v })}
          options={device.sourceList.map((s) => ({ value: s, label: s }))}
          size="xs"
        />
      )}

      {(hasControl(card, 'volume') || hasControl(card, 'mute')) && (
        <div className="flex items-center gap-2">
          {hasControl(card, 'mute') && (
            <button
              type="button"
              onClick={() => send('mute', { type: 'media_player', action: device.muted ? 'unmute' : 'mute' })}
              disabled={isPending('mute') || !isOn}
              title={device.muted ? 'Unmute' : 'Mute'}
              className="rounded p-1"
              style={{ color: device.muted ? token('--color-danger') : token('--color-text-secondary') }}
            >
              {device.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          )}
          {hasControl(card, 'volume') && (
            <div className="flex-1">
              <ThrottledSlider
                value={device.volume}
                onValueCommit={(v) => send('volume', { type: 'media_player', action: 'set_volume', volume: v })}
                disabled={!isOn}
              />
            </div>
          )}
          <span className="w-8 text-right text-xs tabular-nums" style={{ color: token('--color-text-muted') }}>
            {device.volume}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spotify-style music player with artwork + transport
// ---------------------------------------------------------------------------

function MusicPlayerBody({ card, device }: { card: MediaTileCardDescriptor; device: MusicPlayerState }) {
  const { send, isPending } = useCommand(device.id);
  const label = card.name ?? device.displayName ?? device.name;
  const showArt = card.showArtwork && device.albumArt;

  const trackInfo = device.trackName || device.artistName
    ? `${device.trackName ?? ''}${device.artistName ? ' · ' + device.artistName : ''}`
    : 'Nothing playing';

  return (
    <div
      className="flex flex-col gap-2 rounded-lg p-3"
      style={{
        background: token('--color-bg-card'),
        color: token('--color-text'),
        border: `1px solid ${token('--color-border')}`,
      }}
      data-card-type="media-tile"
    >
      <span className="truncate text-sm font-medium">{label}</span>

      <div className="flex items-center gap-3">
        {showArt && (
          // Remote images are opt-in via configured Next.js image domains;
          // a plain <img> keeps us out of that config whack-a-mole.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={device.albumArt ?? ''}
            alt=""
            className="h-14 w-14 flex-shrink-0 rounded object-cover"
            style={{ background: token('--color-bg-hover') }}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs" style={{ color: token('--color-text-muted') }}>
            {trackInfo}
          </div>
          {device.albumName && (
            <div className="truncate text-[10px]" style={{ color: token('--color-text-muted') }}>
              {device.albumName}
            </div>
          )}
        </div>
      </div>

      {(hasControl(card, 'skip') || hasControl(card, 'play-pause')) && (
        <div className="flex items-center justify-center gap-3">
          {hasControl(card, 'skip') && (
            <button
              type="button"
              onClick={() => send('prev', { type: 'music_player', action: 'previous' })}
              disabled={isPending('prev')}
              className="rounded-full p-1.5"
              style={{ color: token('--color-text-secondary'), background: token('--color-bg-hover') }}
              aria-label="Previous track"
            >
              <SkipBack className="h-4 w-4" />
            </button>
          )}
          {hasControl(card, 'play-pause') && (
            <button
              type="button"
              onClick={() => send('pp', { type: 'music_player', action: device.playing ? 'pause' : 'play' })}
              disabled={isPending('pp')}
              className="rounded-full p-2"
              style={{ background: token('--color-accent'), color: '#fff' }}
              aria-label={device.playing ? 'Pause' : 'Play'}
            >
              {device.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
          )}
          {hasControl(card, 'skip') && (
            <button
              type="button"
              onClick={() => send('next', { type: 'music_player', action: 'next' })}
              disabled={isPending('next')}
              className="rounded-full p-1.5"
              style={{ color: token('--color-text-secondary'), background: token('--color-bg-hover') }}
              aria-label="Next track"
            >
              <SkipForward className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {hasControl(card, 'volume') && device.volume != null && (
        <div className="flex items-center gap-2">
          <Volume2 className="h-3.5 w-3.5" style={{ color: token('--color-text-muted') }} />
          <div className="flex-1">
            <ThrottledSlider
              value={device.volume}
              onValueCommit={(v) => send('volume', { type: 'music_player', action: 'set_volume', volume: v })}
            />
          </div>
          <span className="w-8 text-right text-xs tabular-nums" style={{ color: token('--color-text-muted') }}>
            {device.volume}
          </span>
        </div>
      )}
    </div>
  );
}

function GenericMediaFallback({ card, device }: { card: MediaTileCardDescriptor; device: DeviceState }) {
  const label = card.name ?? device.displayName ?? device.name;
  return (
    <div
      className="rounded-lg p-3 text-xs"
      style={{
        background: token('--color-bg-card'),
        color: token('--color-text-muted'),
        border: `1px dashed ${token('--color-border')}`,
      }}
      data-card-type="media-tile"
    >
      <div className="font-medium" style={{ color: token('--color-text') }}>{label}</div>
      <div>Device type &quot;{device.type}&quot; is not a supported media player.</div>
    </div>
  );
}
