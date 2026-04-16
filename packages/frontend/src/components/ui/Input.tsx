'use client';

// ---------------------------------------------------------------------------
// Chrome-consistent text inputs.
//
// Recipe (extracted from settings/users/page.tsx inputs):
//   className="w-full rounded-lg px-3 py-2 text-sm outline-none"
//   style={{
//     backgroundColor: 'var(--color-bg-secondary)',
//     border: '1px solid var(--color-border)',
//     color: 'var(--color-text)',
//   }}
//
// Size variants:
//   md (default) — px-3 py-2 text-sm                (settings forms)
//   sm           — rounded-md px-2 py-1.5 text-xs   (inline editor fields)
//   mono         — text-xs font-mono, otherwise same as variant
// ---------------------------------------------------------------------------

import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

type InputSize = 'md' | 'sm';

const sizeClass: Record<InputSize, string> = {
  md: 'rounded-lg px-3 py-2 text-sm',
  sm: 'rounded-md px-2 py-1.5 text-xs',
};

const inputStyle = {
  backgroundColor: 'var(--color-bg-secondary)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-text)',
} as const;

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  size?: InputSize;
  mono?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = 'md', mono, className = '', style, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      {...rest}
      className={`w-full outline-none transition-colors focus:border-[var(--color-accent)] ${sizeClass[size]} ${mono ? 'font-mono text-xs' : ''} ${className}`}
      style={{ ...inputStyle, ...style }}
    />
  );
});

type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'> & {
  size?: InputSize;
  mono?: boolean;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { size = 'md', mono, className = '', style, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      {...rest}
      className={`w-full outline-none transition-colors focus:border-[var(--color-accent)] ${sizeClass[size]} ${mono ? 'font-mono text-xs' : ''} ${className}`}
      style={{ ...inputStyle, ...style }}
    />
  );
});
