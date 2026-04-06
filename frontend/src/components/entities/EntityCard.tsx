'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Power,
  CircleAlert,
  CircleHelp,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { useEntity } from '@/hooks/useEntity';
import { useSendCommand } from '@/hooks/useSendCommand';

interface EntityCardProps {
  entityId: string;
  name?: string;
  icon?: LucideIcon;
  showState?: boolean;
  onClick?: () => void;
  className?: string;
}

function stateColor(state: string | null | undefined): string {
  switch (state) {
    case 'on':
      return 'text-accent';
    case 'off':
      return 'text-zinc-600';
    case 'unavailable':
    case 'unknown':
      return 'text-yellow-500';
    default:
      return 'text-zinc-400';
  }
}

function formatTimeAgo(ts: number | null): string {
  if (!ts) return '';
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export function EntityCard({
  entityId,
  name,
  icon,
  showState = true,
  onClick,
  className,
}: EntityCardProps) {
  const { state, attributes, lastChanged, loading } = useEntity(entityId);
  const sendCommand = useSendCommand();

  const Icon = icon ?? (state === 'unavailable' ? CircleAlert : state === 'unknown' ? CircleHelp : Power);
  const displayName = name ?? (attributes.friendly_name as string) ?? entityId;

  const isSwitchable = useMemo(() => {
    const domain = entityId.split('.')[0];
    return ['light', 'switch', 'fan', 'input_boolean'].includes(domain);
  }, [entityId]);

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (isSwitchable) {
      sendCommand(entityId, 'toggle');
    }
  };

  if (loading) {
    return (
      <Card className={cn('h-20 animate-pulse', className)} padding="md">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-white/5" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 rounded bg-white/5" />
            <div className="h-2.5 w-16 rounded bg-white/5" />
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      hoverable
      onClick={handleClick}
      className={cn('min-h-[76px]', className)}
      padding="md"
    >
      <div className="flex items-center gap-3">
        <motion.div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            state === 'on' ? 'bg-accent/15' : 'bg-white/5'
          )}
          animate={state === 'on' ? { boxShadow: '0 0 12px rgba(59,130,246,0.2)' } : { boxShadow: '0 0 0px transparent' }}
        >
          <Icon size={20} strokeWidth={1.8} className={stateColor(state)} />
        </motion.div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-200 truncate">{displayName}</p>
          <div className="flex items-center gap-2">
            {showState && (
              <span className={cn('text-xs capitalize', stateColor(state))}>
                {state ?? 'unknown'}
              </span>
            )}
            {lastChanged && (
              <span className="text-[10px] text-zinc-600">
                {formatTimeAgo(lastChanged)}
              </span>
            )}
          </div>
        </div>

        {isSwitchable && (
          <div
            className={cn(
              'h-2 w-2 rounded-full transition-colors duration-300',
              state === 'on' ? 'bg-accent shadow-[0_0_6px_rgba(59,130,246,0.4)]' : 'bg-zinc-700'
            )}
          />
        )}
      </div>
    </Card>
  );
}
