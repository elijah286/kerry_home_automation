'use client';

import * as SelectPrimitive from '@radix-ui/react-select';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'xs';
}

const sizeStyles = {
  sm: 'px-2 py-1 text-sm',
  xs: 'px-2 py-1 text-xs',
};

export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  className = '',
  size = 'sm',
}: SelectProps) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        className={`inline-flex items-center justify-between rounded-md border outline-none transition-colors ${sizeStyles[size]} ${className}`}
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border)',
          color: disabled ? 'var(--color-text-muted)' : 'var(--color-text)',
          opacity: disabled ? 0.7 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon className="ml-2 shrink-0">
          <ChevronDown size={size === 'xs' ? 12 : 14} style={{ color: 'var(--color-text-muted)' }} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="z-50 overflow-hidden rounded-lg border shadow-lg"
          style={{
            backgroundColor: 'var(--color-bg-primary)',
            borderColor: 'var(--color-border)',
          }}
          position="popper"
          sideOffset={4}
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value}
                value={opt.value}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 outline-none cursor-pointer transition-colors ${size === 'xs' ? 'text-xs' : 'text-sm'}`}
                style={{ color: 'var(--color-text)' }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--color-bg-hover)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                }}
              >
                <SelectPrimitive.ItemIndicator>
                  <Check size={size === 'xs' ? 12 : 14} style={{ color: 'var(--color-accent)' }} />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
