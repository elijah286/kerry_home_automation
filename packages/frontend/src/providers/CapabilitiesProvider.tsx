'use client';

// ---------------------------------------------------------------------------
// CapabilitiesProvider — exposes the hardware tier + explicit user override
// to any component that needs to adapt render strategy.
//
// `useCapabilityTier()` is the primary consumer. Override flows:
//   1. Default: auto-detect on mount.
//   2. User override (via ui-preferences / admin UI): pinned value overrides
//      auto-detection. Lets the user force `low` on an underpowered tablet
//      that misreports memory, or `high` when we misdetect.
//   3. Dev-mode override via `?tier=low` URL param for quick testing.
//
// The CameraCoordinator singleton lives alongside this provider and is
// re-budgeted whenever the effective tier changes.
// ---------------------------------------------------------------------------

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { detectCapabilities, type Capabilities, type CapabilityTier } from '@/lib/capabilities';

interface CapabilitiesContextValue {
  capabilities: Capabilities;
  /** Effective tier — override if set, otherwise detected. */
  tier: CapabilityTier;
  /** Explicit override set by the user (null = follow detection). */
  override: CapabilityTier | null;
  setOverride: (tier: CapabilityTier | null) => void;
}

const CapabilitiesContext = createContext<CapabilitiesContextValue | null>(null);

export function CapabilitiesProvider({ children }: { children: ReactNode }) {
  // Detection is idempotent and fast — computing it at module init would run
  // during SSR where `navigator` is absent. Do it in state initialiser so it
  // happens once on the client.
  const [capabilities] = useState<Capabilities>(() => detectCapabilities());
  const [override, setOverrideState] = useState<CapabilityTier | null>(() => readUrlOverride());

  const tier = override ?? capabilities.tier;

  const value = useMemo<CapabilitiesContextValue>(() => ({
    capabilities,
    tier,
    override,
    setOverride: (next) => setOverrideState(next),
  }), [capabilities, tier, override]);

  return <CapabilitiesContext.Provider value={value}>{children}</CapabilitiesContext.Provider>;
}

export function useCapabilities(): CapabilitiesContextValue {
  const ctx = useContext(CapabilitiesContext);
  if (!ctx) throw new Error('useCapabilities must be used inside <CapabilitiesProvider>');
  return ctx;
}

/** Shortcut for the very common "I just want the tier" case. */
export function useCapabilityTier(): CapabilityTier {
  return useCapabilities().tier;
}

function readUrlOverride(): CapabilityTier | null {
  if (typeof window === 'undefined') return null;
  const t = new URLSearchParams(window.location.search).get('tier');
  if (t === 'low' || t === 'mid' || t === 'high') return t;
  return null;
}
