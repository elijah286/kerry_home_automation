// ---------------------------------------------------------------------------
// Fast-path command executor — bypasses the LLM for simple device commands.
//
// For patterns like "turn off kitchen lights" or "dim bedroom lamp to 40%"
// this resolves and executes in ~100ms instead of ~2000ms.
//
// SAFETY RULES:
//   - Only fires on unambiguous matches (exactly 1 device, or clear bulk op)
//   - Only for admin users (send_command is admin-only)
//   - On ANY error or ambiguity → returns handled:false, LLM takes over
//   - Never blocks; always has a safe fallback
// ---------------------------------------------------------------------------

import { stateStore } from '../state/store.js';
import { registry } from '../integrations/registry.js';
import type { DeviceCommand, DeviceState } from '@ha/shared';
import { logger } from '../logger.js';

// Device types the fast path will control
const CONTROLLABLE_TYPES = new Set([
  'light', 'switch', 'fan', 'cover', 'garage_door',
]);

export interface FastPathResult {
  handled: boolean;
  reply?: string;
}

// ---------------------------------------------------------------------------
// Text normalization + scoring
// ---------------------------------------------------------------------------

function normalize(s: string): string {
  return s.toLowerCase().replace(/['']/g, "'").replace(/[^a-z0-9\s']/g, '').trim();
}

function tokenize(s: string): string[] {
  return normalize(s).split(/\s+/).filter(Boolean);
}

// Stopwords that don't contribute to device matching
const STOPWORDS = new Set([
  'the', 'a', 'an', 'my', 'our', 'all', 'please', 'can', 'you',
  'turn', 'switch', 'put', 'on', 'off', 'lights', 'light',
  'fans', 'fan', 'switches', 'switch',
]);

function significantTokens(tokens: string[]): string[] {
  return tokens.filter((t) => !STOPWORDS.has(t) && t.length > 1);
}

/**
 * Score [0–1] of how well a device's names/aliases match a query string.
 */
function scoreDevice(device: DeviceState, query: string): number {
  const qTokens = tokenize(query);
  const qSig = significantTokens(qTokens);
  if (qSig.length === 0) return 0;

  const candidateNames = [
    device.displayName || device.name,
    ...(device.aliases ?? []),
  ].map(normalize);

  let best = 0;

  for (const name of candidateNames) {
    const nTokens = tokenize(name);

    // Exact normalized match
    if (name === normalize(query)) { best = Math.max(best, 1.0); continue; }

    // All significant query tokens present in name
    const nameSet = new Set(nTokens);
    const allPresent = qSig.every((t) => nameSet.has(t) || nTokens.some((n) => n.startsWith(t)));
    if (allPresent && qSig.length > 0) { best = Math.max(best, 0.9); continue; }

    // Token overlap ratio
    const overlap = qSig.filter((t) => nameSet.has(t)).length;
    if (overlap > 0) {
      const score = (overlap / Math.max(qSig.length, nTokens.length)) * 0.7;
      best = Math.max(best, score);
    }
  }

  return best;
}

/**
 * Find controllable devices matching a free-text query.
 * Returns [] if ambiguous (2+ devices within 20% of top score).
 * Returns [device] only when one clearly wins.
 */
function resolveDevice(query: string): DeviceState | null {
  const candidates = stateStore
    .getAll()
    .filter((d) => CONTROLLABLE_TYPES.has(d.type))
    .map((d) => ({ d, score: scoreDevice(d, query) }))
    .filter(({ score }) => score >= 0.45)
    .sort((a, b) => b.score - a.score);

  if (candidates.length === 0) return null;

  const top = candidates[0];
  // Ambiguous if second candidate is within 20% of top score
  if (candidates.length > 1 && candidates[1].score >= top.score * 0.8) return null;

  return top.d;
}

/**
 * Find ALL devices matching a type (and optional area keyword) for bulk ops.
 */
function resolveBulk(
  typeKeyword: string,
  areaKeyword: string,
): DeviceState[] | null {
  let type: DeviceState['type'] | null = null;
  if (/lights?/.test(typeKeyword)) type = 'light';
  else if (/fans?/.test(typeKeyword)) type = 'fan';
  else if (/switches?/.test(typeKeyword)) type = 'switch';
  if (!type) return null;

  let pool = stateStore.getAll().filter((d) => d.type === type);

  if (areaKeyword) {
    const areaQ = normalize(areaKeyword);
    const filtered = pool.filter((d) =>
      normalize(d.displayName || d.name).includes(areaQ),
    );
    // Only apply area filter if it meaningfully narrows things down
    if (filtered.length > 0) pool = filtered;
  }

  return pool.length > 0 && pool.length <= 30 ? pool : null;
}

// ---------------------------------------------------------------------------
// Intent patterns
// ---------------------------------------------------------------------------

// "turn on/off [the] <device>"
const TURN_RE = /^(?:please\s+)?(?:turn|switch|flip|put)\s+(on|off)\s+(?:the\s+)?(.+)$/i;

// "<device> on/off" — short form: "patio lights off"
const SHORT_TURN_RE = /^(?:the\s+)?(.+?)\s+(on|off)$/i;

// "dim/set/brighten [the] <device> to <n>%"
const BRIGHTNESS_RE =
  /^(?:please\s+)?(?:dim|set|brighten|turn)\s+(?:the\s+)?(.+?)\s+to\s+(\d{1,3})\s*%$/i;

// "turn on/off all [the] <area> <type>"  e.g. "turn off all the kitchen lights"
const BULK_RE = /^(?:please\s+)?(?:turn|switch)\s+(on|off)\s+all\s+(?:the\s+)?(.+)$/i;

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function tryFastPath(
  message: string,
  userRole: string,
): Promise<FastPathResult> {
  // Fast path only for admins — send_command requires admin
  if (userRole !== 'admin') return { handled: false };

  const msg = message.trim().replace(/[.!?]+$/, '');

  try {
    // --- Brightness ---
    const bm = msg.match(BRIGHTNESS_RE);
    if (bm) {
      const [, deviceQuery, pctStr] = bm;
      const brightness = Math.min(100, Math.max(0, parseInt(pctStr, 10)));
      const device = resolveDevice(deviceQuery);
      if (device && device.type === 'light') {
        await registry.handleCommand({
          deviceId: device.id,
          type: 'light',
          action: 'set_brightness',
          brightness,
        } as DeviceCommand);
        const name = device.displayName || device.name;
        logger.info({ deviceId: device.id, brightness, fastPath: true }, 'Fast path: brightness');
        return { handled: true, reply: `Done — set ${name} to ${brightness}%.` };
      }
    }

    // --- Bulk turn on/off ---
    const bk = msg.match(BULK_RE);
    if (bk) {
      const [, onOff, rest] = bk;
      const action = onOff.toLowerCase() === 'on' ? 'turn_on' : 'turn_off';
      // Split "kitchen lights" into area="kitchen" type="lights"
      const words = rest.trim().split(/\s+/);
      const typeWord = words[words.length - 1];
      const areaWord = words.slice(0, -1).join(' ');
      const devices = resolveBulk(typeWord, areaWord);
      if (devices && devices.length > 0) {
        await Promise.all(
          devices.map((d) =>
            registry.handleCommand({ deviceId: d.id, type: d.type, action } as DeviceCommand),
          ),
        );
        const label = areaWord ? `${areaWord} ${typeWord}` : typeWord;
        logger.info({ count: devices.length, action, fastPath: true }, 'Fast path: bulk');
        return {
          handled: true,
          reply: `Done — turned ${onOff.toLowerCase()} ${devices.length} ${label}.`,
        };
      }
    }

    // --- Single turn on/off (standard form) ---
    const tm = msg.match(TURN_RE);
    if (tm) {
      const [, onOff, deviceQuery] = tm;
      const device = resolveDevice(deviceQuery);
      if (device) {
        const action = onOff.toLowerCase() === 'on' ? 'turn_on' : 'turn_off';
        await registry.handleCommand({
          deviceId: device.id,
          type: device.type,
          action,
        } as DeviceCommand);
        const name = device.displayName || device.name;
        logger.info({ deviceId: device.id, action, fastPath: true }, 'Fast path: turn on/off');
        return { handled: true, reply: `Done — turned ${onOff.toLowerCase()} ${name}.` };
      }
    }

    // --- Single turn on/off (short form: "patio lights off") ---
    const sm = msg.match(SHORT_TURN_RE);
    if (sm) {
      const [, deviceQuery, onOff] = sm;
      const device = resolveDevice(deviceQuery);
      if (device) {
        const action = onOff.toLowerCase() === 'on' ? 'turn_on' : 'turn_off';
        await registry.handleCommand({
          deviceId: device.id,
          type: device.type,
          action,
        } as DeviceCommand);
        const name = device.displayName || device.name;
        logger.info({ deviceId: device.id, action, fastPath: true }, 'Fast path: short form');
        return { handled: true, reply: `Done — turned ${onOff.toLowerCase()} ${name}.` };
      }
    }
  } catch (err) {
    // Never block — if anything fails, fall through to the LLM
    logger.warn({ err }, 'Fast path error — falling back to LLM');
    return { handled: false };
  }

  return { handled: false };
}
