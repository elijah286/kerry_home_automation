'use client';

import { clsx } from 'clsx';

export function Card({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={clsx(
        'rounded-[var(--radius)] border p-4',
        'bg-[var(--color-bg-card)] border-[var(--color-border)]',
        onClick && 'cursor-pointer hover:border-[var(--color-border-hover)] transition-colors',
        className,
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
