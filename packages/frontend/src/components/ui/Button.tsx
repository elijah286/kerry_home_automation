'use client';

// ---------------------------------------------------------------------------
// Chrome-consistent button primitives.
//
// Recipes extracted from settings pages (settings/users, software-update):
//
//   PrimaryButton   — accent background, white foreground, rounded-lg px-3 py-1.5 text-xs font-medium
//   SecondaryButton — bg-secondary + border, text-color, rounded-lg px-3 py-1.5 text-xs font-medium
//   GhostIconButton — icon-only, p-1.5 rounded-lg, transparent until hover
//
// All three accept an optional lucide icon on the left. Always render a <button>;
// if you want Link behaviour, wrap in <Link>.
// ---------------------------------------------------------------------------

import { createElement, forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type ButtonBaseProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: React.ElementType;
  children?: ReactNode;
};

const baseButton =
  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

export const PrimaryButton = forwardRef<HTMLButtonElement, ButtonBaseProps>(
  function PrimaryButton({ icon, className = '', children, style, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        {...rest}
        className={`${baseButton} ${className}`}
        style={{
          background: 'var(--color-accent)',
          color: '#fff',
          ...style,
        }}
      >
        {icon && createElement(icon, { className: 'h-3.5 w-3.5' })}
        {children}
      </button>
    );
  },
);

export const SecondaryButton = forwardRef<HTMLButtonElement, ButtonBaseProps>(
  function SecondaryButton({ icon, className = '', children, style, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        {...rest}
        className={`${baseButton} ${className}`}
        style={{
          background: 'var(--color-bg-secondary)',
          color: 'var(--color-text)',
          border: '1px solid var(--color-border)',
          ...style,
        }}
      >
        {icon && createElement(icon, { className: 'h-3.5 w-3.5' })}
        {children}
      </button>
    );
  },
);

type DangerButtonProps = ButtonBaseProps & { variant?: 'danger' | 'warning' | 'success' };

export const StatusButton = forwardRef<HTMLButtonElement, DangerButtonProps>(
  function StatusButton({ icon, className = '', children, variant = 'danger', style, ...rest }, ref) {
    const color = `var(--color-${variant})`;
    return (
      <button
        ref={ref}
        type="button"
        {...rest}
        className={`${baseButton} ${className}`}
        style={{
          background: `color-mix(in srgb, ${color} 12%, transparent)`,
          color,
          border: `1px solid color-mix(in srgb, ${color} 30%, var(--color-border))`,
          ...style,
        }}
      >
        {icon && createElement(icon, { className: 'h-3.5 w-3.5' })}
        {children}
      </button>
    );
  },
);

type GhostIconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: React.ElementType;
  iconClassName?: string;
  tone?: 'default' | 'danger' | 'accent';
};

export const GhostIconButton = forwardRef<HTMLButtonElement, GhostIconButtonProps>(
  function GhostIconButton(
    { icon, iconClassName = 'h-3.5 w-3.5', tone = 'default', className = '', style, ...rest },
    ref,
  ) {
    const toneColor =
      tone === 'danger'
        ? 'var(--color-danger)'
        : tone === 'accent'
          ? 'var(--color-accent)'
          : 'var(--color-text-muted)';
    return (
      <button
        ref={ref}
        type="button"
        {...rest}
        className={`inline-flex items-center justify-center rounded-lg p-1.5 transition-colors hover:bg-[var(--color-bg-hover)] disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        style={{ color: toneColor, ...style }}
      >
        {createElement(icon, { className: iconClassName })}
      </button>
    );
  },
);
