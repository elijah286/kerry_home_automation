'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingMap = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
} as const;

export function Card({
  children,
  className,
  onClick,
  hoverable = false,
  padding = 'md',
}: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-xl border border-border bg-card',
        paddingMap[padding],
        onClick && 'cursor-pointer',
        hoverable && 'transition-shadow hover:shadow-lg hover:shadow-accent/5 hover:scale-[1.015]',
        'transition-all duration-200',
        className
      )}
    >
      {children}
    </div>
  );
}
