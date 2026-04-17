// ---------------------------------------------------------------------------
// LLM device-class inference.
//
//   POST /api/devices/:id/infer-class    → single device (returns proposal)
//   POST /api/devices/infer-classes      → batch (SSE progress stream)
//
// The single-device route is read-only: it asks the LLM for a proposal and
// returns it. Accepting the proposal is a separate PUT to the device-class
// route — callers decide whether to persist.
//
// The batch route writes: each inference result is upserted into
// `device_settings` with `device_class_source = 'llm'`. Two modes:
//   - 'missing' — only touches devices whose `device_class` is NULL.
//     Safe by default; never overwrites admin/bridge values.
//   - 'all'     — re-infers every device. The "Regenerate device classes"
//     button — nuclear, per-user's explicit request, used after the taxonomy
//     evolves or a large import lands.
//
// Progress is streamed via SSE. Each event is a JSON object on a `data:`
// line followed by the standard `\n\n` terminator. The frontend consumer
// (`inferDeviceClassesBulk` in `api-device-cards.ts`) pumps the stream with a
// `for await` loop and renders a live progress bar.
//
// Why SSE and not WebSocket: this is strictly server→client, one-shot,
// auth-scoped to the HTTP session. SSE is the simplest shape that satisfies
// that — no WS handshake, no message framing, no reconnect logic.
// ---------------------------------------------------------------------------

import type { FastifyInstance, FastifyReply } from 'fastify';
import OpenAI from 'openai';
import { DEVICE_CLASSES, type DeviceState } from '@ha/shared';
import { query } from '../db/pool.js';
import { stateStore } from '../state/store.js';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// Shared: load API key + build the OpenAI client
// ---------------------------------------------------------------------------

/**
 * Resolve the OpenAI client from `system_settings.llm_api_key`.
 * Returns `null` if no key is configured — the caller should surface a 400.
 */
async function getOpenAiClient(): Promise<OpenAI | null> {
  const { rows } = await query<{ value: unknown }>(
    "SELECT value FROM system_settings WHERE key = 'llm_api_key'",
  );
  const apiKey = rows[0]?.value as string | undefined;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

/**
 * Compact the device down to the fields the LLM can actually reason about.
 * We deliberately omit runtime state (brightness, volume, etc.) — those
 * change minute-to-minute and classifying is meant to be stable.
 *
 * Keeps the prompt small so batch inference stays fast/cheap; GPT-4o
 * decides on class from name + type + integration + unit alone.
 */
function deviceSummary(device: DeviceState): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: device.id,
    type: device.type,
    name: device.displayName || device.name,
    integration: device.integration,
  };
  if (device.aliases?.length) base.aliases = device.aliases;

  // Type-specific hints the LLM keys off of for sensors — unit and sensorType
  // are the strongest signals (°F → temperature, % → humidity/battery, etc.)
  if (device.type === 'sensor') {
    const s = device as Extract<DeviceState, { type: 'sensor' }>;
    if (s.unit) base.unit = s.unit;
    if (s.sensorType) base.sensorType = s.sensorType;
  }
  return base;
}

const SYSTEM_PROMPT = `You classify smart-home devices into a controlled vocabulary.

Given a device, return the single best \`device_class\` from this list:
${DEVICE_CLASSES.join(', ')}

Rules:
- Return exactly one class. If nothing fits, return "unknown".
- Prefer specificity: "temperature" over "unknown" if the device clearly measures temperature.
- For cover-type devices, "blind" / "shade" / "shutter" / "curtain" / "garage_door" are the common choices.
- For sensor-type devices, prefer the physical quantity: temperature, humidity, battery, illuminance, power, energy, co2, pm25, door, window, motion, etc.
- For switch/outlet devices: "outlet", "switch", "plug" are common.
- \`confidence\`: "high" when name + unit unambiguously identify it; "medium" when name hints but unit is missing; "low" when it's a guess.
- \`rationale\`: one short sentence explaining the choice. No marketing copy.`;

const JSON_SCHEMA = {
  name: 'device_class_inference',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      device_class: { type: 'string', enum: [...DEVICE_CLASSES] },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      rationale: { type: 'string' },
    },
    required: ['device_class', 'confidence', 'rationale'],
  },
} as const;

interface InferenceResult {
  device_class: string;
  confidence: 'high' | 'medium' | 'low';
  rationale: string;
}

/**
 * Run inference for a single device. Throws on OpenAI errors; caller decides
 * whether to surface as HTTP 500 or skip-and-continue (batch mode).
 */
async function inferForDevice(openai: OpenAI, device: DeviceState): Promise<InferenceResult> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(deviceSummary(device)) },
    ],
    response_format: { type: 'json_schema', json_schema: JSON_SCHEMA },
    temperature: 0.1,
  });

  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error('Empty LLM response');
  const parsed = JSON.parse(text) as InferenceResult;

  // Defensive: strict json_schema *should* guarantee this, but a bad model
  // response could slip a value through. Clamp to 'unknown' rather than
  // persist junk.
  if (!DEVICE_CLASSES.includes(parsed.device_class as typeof DEVICE_CLASSES[number])) {
    parsed.device_class = 'unknown';
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// SSE helpers — plain Fastify reply writes, no framework plugin required.
// ---------------------------------------------------------------------------

/**
 * Send one SSE event. The data line is a JSON blob; events are separated by
 * the standard `\n\n` terminator that EventSource / the frontend reader
 * both key off of.
 */
function sendSse(reply: FastifyReply, payload: unknown): void {
  reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
}

// ---------------------------------------------------------------------------
// Persistence — write inferred class to device_settings + mirror to store
// ---------------------------------------------------------------------------

async function persistInferredClass(deviceId: string, deviceClass: string): Promise<void> {
  await query(
    `INSERT INTO device_settings (device_id, device_class, device_class_source, updated_at)
     VALUES ($1, $2, 'llm', NOW())
     ON CONFLICT (device_id) DO UPDATE SET
       device_class = EXCLUDED.device_class,
       device_class_source = 'llm',
       updated_at = NOW()`,
    [deviceId, deviceClass],
  );
  const device = stateStore.get(deviceId);
  if (device) {
    stateStore.update({
      ...device,
      device_class: deviceClass,
      device_class_source: 'llm',
    });
  }
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerDeviceClassInferenceRoutes(app: FastifyInstance): void {
  // --- Single-device inference --------------------------------------------
  //
  // Returns a proposal without writing. The admin UI uses this to preview
  // the LLM's guess in a tooltip before the human accepts/rejects it.

  app.post<{ Params: { id: string } }>(
    '/api/devices/:id/infer-class',
    async (req, reply) => {
      if (req.user?.role !== 'admin') {
        return reply.code(403).send({ error: 'Admin role required' });
      }

      const device = stateStore.get(req.params.id);
      if (!device) return reply.code(404).send({ error: 'Device not found' });

      const openai = await getOpenAiClient();
      if (!openai) {
        return reply.code(400).send({
          error: 'OpenAI API key not configured. Go to Settings → LLM Integration to add one.',
        });
      }

      try {
        const result = await inferForDevice(openai, device);
        logger.info(
          { deviceId: device.id, device_class: result.device_class, confidence: result.confidence },
          'LLM device-class inference',
        );
        return result;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ err, deviceId: device.id }, 'Single inference failed');
        return reply.code(500).send({ error: `Inference failed: ${message}` });
      }
    },
  );

  // --- Batch inference with SSE -------------------------------------------
  //
  // Streams `progress` events as each device completes, then a final `done`.
  // On transient OpenAI errors per device we emit an `error` event and keep
  // going — one flaky response shouldn't kill the whole run.
  //
  // Concurrency is intentionally serial (one request at a time). Batches of
  // 500+ devices are realistic for large installs and parallel OpenAI calls
  // are both rate-limit-risky and make SSE ordering meaningless. The user
  // watches a progress bar anyway; serial keeps the semantics obvious.

  app.post<{ Body: { mode?: 'missing' | 'all' } }>(
    '/api/devices/infer-classes',
    async (req, reply) => {
      if (req.user?.role !== 'admin') {
        return reply.code(403).send({ error: 'Admin role required' });
      }

      const mode = req.body?.mode ?? 'missing';
      const openai = await getOpenAiClient();
      if (!openai) {
        return reply.code(400).send({
          error: 'OpenAI API key not configured. Go to Settings → LLM Integration to add one.',
        });
      }

      // Select targets: 'missing' skips devices that already have a class
      // (regardless of source), 'all' re-infers everything. `all` overwrites
      // even admin-curated values — the user explicitly asked for that via
      // the "Regenerate" button.
      const all = stateStore.getAll();
      const targets = mode === 'all'
        ? all
        : all.filter((d) => !d.device_class);

      // Open the SSE stream. `reply.hijack()` signals Fastify that we're
      // taking over the response — no more hooks/serialization will fire.
      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache');
      reply.raw.setHeader('Connection', 'keep-alive');
      reply.raw.setHeader('X-Accel-Buffering', 'no'); // Disable nginx proxy buffering
      reply.raw.flushHeaders();
      reply.hijack();

      logger.info({ mode, count: targets.length }, 'Starting batch device-class inference');

      let done = 0;
      const total = targets.length;

      // Client disconnect: set a flag, break the loop on the next iteration.
      // We don't cancel the in-flight OpenAI request — it's already paid for
      // — but we stop queuing new ones.
      let aborted = false;
      req.raw.on('close', () => {
        aborted = true;
      });

      try {
        for (const device of targets) {
          if (aborted) {
            logger.info({ done, total }, 'Batch inference aborted by client');
            break;
          }

          try {
            const result = await inferForDevice(openai, device);
            await persistInferredClass(device.id, result.device_class);
            done++;
            sendSse(reply, {
              kind: 'progress',
              done,
              total,
              deviceId: device.id,
              device_class: result.device_class,
            });
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            logger.warn({ err, deviceId: device.id }, 'Per-device inference failed; continuing');
            done++;
            sendSse(reply, {
              kind: 'error',
              done,
              total,
              deviceId: device.id,
              error: message,
            });
          }
        }

        sendSse(reply, { kind: 'done', done, total });
      } finally {
        reply.raw.end();
      }
    },
  );
}
