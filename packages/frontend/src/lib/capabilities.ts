// ---------------------------------------------------------------------------
// Hardware capability detection.
//
// Produces a `CapabilityTier` — low / mid / high — that the app uses to pick
// between cheap and rich renders (MSE video vs snapshot polling, full history
// graph vs sparkline, etc.). Detection is a single sync read; we *never*
// re-detect mid-session because a kiosk's hardware doesn't change under us.
//
// Heuristics (in order of weight):
//   - `navigator.deviceMemory` (Chrome/Edge/Samsung Internet): <2GB → low,
//     2-4GB → mid, ≥4GB → high
//   - `navigator.hardwareConcurrency`: <4 → nudge down, ≥8 → nudge up
//   - `navigator.connection.effectiveType`: 'slow-2g'|'2g' → floor at low
//
// The Samsung A9+ tablet reports ~4GB RAM and 8 cores — these land at `mid`.
// iPad Pro reports no deviceMemory (Safari withholds) so we fall back to UA
// sniff for known iPads and pin them to `high`.
//
// Callers should always also honour the user's explicit override from
// ui-preferences; that bypasses detection entirely.
// ---------------------------------------------------------------------------

export type CapabilityTier = 'low' | 'mid' | 'high';

export interface Capabilities {
  tier: CapabilityTier;
  /** Raw signals, kept for diagnostics / "why did I get this tier" UI. */
  signals: {
    deviceMemoryGb: number | null;
    cpuCores: number | null;
    effectiveConnection: string | null;
    userAgent: string;
    isIpad: boolean;
    detectedAt: number;
  };
}

// Stream budgets the CameraCoordinator uses when deciding which feeds go live.
// Kept here so a one-line change here flows through.
export const CAMERA_BUDGET: Record<CapabilityTier, number> = {
  low: 2,
  mid: 4,
  high: 6,
};

// Rolling-graph point budgets. Low-tier devices can't redraw 4k data points at
// 60fps without jank.
export const HISTORY_POINT_BUDGET: Record<CapabilityTier, number> = {
  low: 150,
  mid: 500,
  high: 2000,
};

export function detectCapabilities(): Capabilities {
  if (typeof navigator === 'undefined') {
    // SSR path — assume high to avoid downgrading before hydration.
    return {
      tier: 'high',
      signals: {
        deviceMemoryGb: null,
        cpuCores: null,
        effectiveConnection: null,
        userAgent: '',
        isIpad: false,
        detectedAt: Date.now(),
      },
    };
  }

  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { effectiveType?: string };
  };

  const deviceMemoryGb = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null;
  const cpuCores = typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null;
  const effectiveConnection = nav.connection?.effectiveType ?? null;
  const userAgent = nav.userAgent || '';

  // Modern iPad Safari reports itself as "Macintosh" — detect via touch points.
  const isIpad = /iPad/.test(userAgent)
    || (/Macintosh/.test(userAgent) && (nav.maxTouchPoints ?? 0) > 1);

  let tier: CapabilityTier;

  if (deviceMemoryGb !== null) {
    if (deviceMemoryGb < 2) tier = 'low';
    else if (deviceMemoryGb < 4) tier = 'mid';
    else tier = 'high';
  } else if (isIpad) {
    // Safari hides deviceMemory. iPads meeting our kiosk cut-off (Pro) are all
    // high tier; older iPads are rare enough to accept a small mis-classification.
    tier = 'high';
  } else {
    // Fall back to core count if memory is unknown.
    if (cpuCores === null) tier = 'mid';
    else if (cpuCores < 4) tier = 'low';
    else if (cpuCores < 8) tier = 'mid';
    else tier = 'high';
  }

  // CPU floor/ceiling adjustment.
  if (cpuCores !== null) {
    if (tier === 'high' && cpuCores < 4) tier = 'mid';
    if (tier === 'low' && cpuCores >= 8 && deviceMemoryGb !== null && deviceMemoryGb >= 2) tier = 'mid';
  }

  // Bad connection clamps to low — no point streaming live video.
  if (effectiveConnection === 'slow-2g' || effectiveConnection === '2g') tier = 'low';

  return {
    tier,
    signals: {
      deviceMemoryGb,
      cpuCores,
      effectiveConnection,
      userAgent,
      isIpad,
      detectedAt: Date.now(),
    },
  };
}
