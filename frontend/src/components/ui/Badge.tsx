'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-white/10 text-zinc-300',
  success: 'bg-emerald-500/15 text-emerald-400 shadow-[0_0_8px_rgba(34,197,94,0.15)]',
  warning: 'bg-yellow-500/15 text-yellow-400 shadow-[0_0_8px_rgba(234,179,8,0.15)]',
  danger: 'bg-red-500/15 text-red-400 shadow-[0_0_8px_rgba(239,68,68,0.15)]',
  info: 'bg-blue-500/15 text-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.15)]',
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-[10px]',
  md: 'px-2.5 py-1 text-xs',
};

export function Badge({
  children,
  variant = 'default',
  size = 'md',
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium tracking-wide uppercase',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
    >
      {children}
    </span>
  );
}
