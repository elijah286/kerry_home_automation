'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { DeviceState } from '@ha/shared';

interface DeviceAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  devices: DeviceState[];
  placeholder?: string;
  className?: string;
  label?: string;
}

export function DeviceAutocomplete({
  value,
  onChange,
  devices,
  placeholder = 'Start typing a device...',
  className = '',
  label,
}: DeviceAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [highlightIdx, setHighlightIdx] = useState(0);

  useEffect(() => { setQuery(value); }, [value]);

  const filtered = query
    ? devices
        .filter(d =>
          d.id.toLowerCase().includes(query.toLowerCase()) ||
          (d.displayName ?? d.name).toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, 20)
    : [];

  const isValid = !value || devices.some(d => d.id === value);

  const handleSelect = useCallback((id: string) => {
    onChange(id);
    setQuery(id);
    setOpen(false);
  }, [onChange]);

  const handleInputChange = (val: string) => {
    setQuery(val);
    onChange(val);
    setOpen(val.length > 0);
    setHighlightIdx(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      handleSelect(filtered[highlightIdx].id);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className={`relative ${className}`}>
      {label && (
        <label className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
          {label}
        </label>
      )}
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => query && setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`w-full rounded border px-2 py-1 text-xs ${label ? 'mt-0.5' : ''}`}
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          borderColor: !isValid ? 'var(--color-danger)' : 'var(--color-border)',
          color: 'var(--color-text)',
        }}
      />
      {!isValid && value && (
        <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-danger)' }}>
          Device not found: {value}
        </p>
      )}
      {open && filtered.length > 0 && (
        <div
          ref={menuRef}
          className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border shadow-lg"
          style={{
            backgroundColor: 'var(--color-bg-primary)',
            borderColor: 'var(--color-border)',
          }}
        >
          {filtered.map((d, i) => (
            <button
              key={d.id}
              className="w-full text-left px-2.5 py-1.5 text-xs flex flex-col transition-colors"
              style={{
                backgroundColor: i === highlightIdx ? 'var(--color-bg-hover)' : 'transparent',
              }}
              onMouseEnter={() => setHighlightIdx(i)}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(d.id); }}
            >
              <span className="font-medium truncate">{d.displayName ?? d.name}</span>
              <span className="font-mono text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>
                {d.id}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
