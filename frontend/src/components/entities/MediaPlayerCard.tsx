'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Pause,
  Square,
  Volume2,
  VolumeX,
  ChevronDown,
  Music,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Slider } from '@/components/ui/Slider';
import { useEntity } from '@/hooks/useEntity';
import { useSendCommand } from '@/hooks/useSendCommand';

interface MediaPlayerCardProps {
  entityId: string;
  name?: string;
  className?: string;
}

export function MediaPlayerCard({ entityId, name, className }: MediaPlayerCardProps) {
  const { state, attributes, loading } = useEntity(entityId);
  const sendCommand = useSendCommand();
  const [sourceOpen, setSourceOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isPlaying = state === 'playing';
  const isPaused = state === 'paused';
  const displayName = name ?? (attributes.friendly_name as string) ?? entityId;
  const mediaTitle = attributes.media_title as string | undefined;
  const mediaArtist = attributes.media_artist as string | undefined;
  const volume = typeof attributes.volume_level === 'number' ? Math.round((attributes.volume_level as number) * 100) : 0;
  const isMuted = attributes.is_volume_muted === true;
  const currentSource = attributes.source as string | undefined;
  const sourceList = (attributes.source_list as string[]) ?? [];

  const togglePlay = useCallback(() => {
    sendCommand(entityId, isPlaying ? 'media_pause' : 'media_play');
  }, [entityId, isPlaying, sendCommand]);

  const stop = useCallback(() => {
    sendCommand(entityId, 'media_stop');
  }, [entityId, sendCommand]);

  const toggleMute = useCallback(() => {
    sendCommand(entityId, 'volume_mute', { is_volume_muted: !isMuted });
  }, [entityId, isMuted, sendCommand]);

  const setVolume = useCallback(
    (val: number) => {
      sendCommand(entityId, 'volume_set', { volume_level: val / 100 });
    },
    [entityId, sendCommand]
  );

  const selectSource = useCallback(
    (source: string) => {
      sendCommand(entityId, 'select_source', { source });
      setSourceOpen(false);
    },
    [entityId, sendCommand]
  );

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSourceOpen(false);
      }
    };
    if (sourceOpen) document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [sourceOpen]);

  if (loading) {
    return (
      <Card className={cn('animate-pulse h-36', className)} padding="md">
        <div className="space-y-3">
          <div className="h-4 w-36 rounded bg-white/5" />
          <div className="h-3 w-24 rounded bg-white/5" />
          <div className="h-8 w-full rounded bg-white/5" />
        </div>
      </Card>
    );
  }

  return (
    <Card className={className} padding="md">
      <div className="flex items-center gap-3 mb-3">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            isPlaying ? 'bg-accent/15' : 'bg-white/5'
          )}
        >
          <Music
            size={20}
            strokeWidth={1.8}
            className={isPlaying ? 'text-accent' : 'text-zinc-600'}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-200 truncate">{displayName}</p>
          {mediaTitle && (
            <p className="text-xs text-zinc-500 truncate">
              {mediaTitle}
              {mediaArtist && ` · ${mediaArtist}`}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 mb-4">
        <button
          onClick={stop}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-zinc-500 hover:bg-white/10 hover:text-zinc-300 active:scale-90 transition-all"
        >
          <Square size={16} fill="currentColor" />
        </button>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={togglePlay}
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-full',
            isPlaying || isPaused
              ? 'bg-accent text-white shadow-[0_0_16px_rgba(59,130,246,0.3)]'
              : 'bg-white/10 text-zinc-400'
          )}
        >
          {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
        </motion.button>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={toggleMute}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <Slider
          value={isMuted ? 0 : volume}
          onValueChange={setVolume}
          min={0}
          max={100}
          showValue
          unit="%"
        />
      </div>

      {sourceList.length > 0 && (
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setSourceOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs text-zinc-400 hover:bg-white/[0.08] transition-colors"
          >
            <span>{currentSource ?? 'Source'}</span>
            <motion.span animate={{ rotate: sourceOpen ? 180 : 0 }}>
              <ChevronDown size={14} />
            </motion.span>
          </button>

          <AnimatePresence>
            {sourceOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-border bg-[#1a1a24] py-1 shadow-xl z-10"
              >
                {sourceList.map((src) => (
                  <button
                    key={src}
                    onClick={() => selectSource(src)}
                    className={cn(
                      'w-full px-3 py-1.5 text-left text-xs transition-colors',
                      src === currentSource
                        ? 'text-accent bg-accent/10'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                    )}
                  >
                    {src}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </Card>
  );
}
