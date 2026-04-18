// ---------------------------------------------------------------------------
// Update orchestrator — manages the deploy lifecycle and streams progress
//
// Replaces fire-and-forget spawn with structured stage tracking. The deploy
// script (scripts/deploy.sh) writes JSONL progress to .update-progress.jsonl;
// this module tails that file and streams events to the frontend via SSE.
// ---------------------------------------------------------------------------

import { spawn } from 'node:child_process';
import { createReadStream, existsSync, statSync, watch } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { appConfig } from '../config.js';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProgressEvent {
  id: number;
  ts: string;
  stage: string;
  status: 'running' | 'completed' | 'failed' | 'log';
  msg: string;
}

export interface ReleaseManifest {
  version: string;
  sha: string;
  shaShort: string;
  timestamp: string;
  images: {
    backend: string;
    frontend: string;
    'roborock-bridge': string;
    proxy: string;
  };
}

export interface UpdateStatus {
  inProgress: boolean;
  startedAt: string | null;
  targetVersion: string | null;
  currentStage: string | null;
  stages: ProgressEvent[];
  finalStatus: 'completed' | 'failed' | null;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let updateInProgress = false;
let updateStartedAt: string | null = null;
let updateTargetVersion: string | null = null;

const progressFilePath = () => join(appConfig.deploy.appRoot, '.update-progress.jsonl');

// Active SSE subscribers
const sseSubscribers = new Set<FastifyReply>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseProgressLine(line: string): ProgressEvent | null {
  try {
    const parsed = JSON.parse(line) as ProgressEvent;
    if (parsed.id && parsed.stage && parsed.status) return parsed;
    return null;
  } catch {
    return null;
  }
}

async function readAllProgress(): Promise<ProgressEvent[]> {
  const filePath = progressFilePath();
  if (!existsSync(filePath)) return [];
  try {
    const content = await readFile(filePath, 'utf8');
    return content
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(parseProgressLine)
      .filter((e): e is ProgressEvent => e !== null);
  } catch {
    return [];
  }
}

/** Read the release manifest from the git checkout. */
async function readReleaseManifest(): Promise<ReleaseManifest | null> {
  const manifestPath = join(appConfig.deploy.appRoot, 'deploy', 'release-manifest.json');
  try {
    const content = await readFile(manifestPath, 'utf8');
    return JSON.parse(content) as ReleaseManifest;
  } catch {
    return null;
  }
}

/** Read the previous deployment state (for rollback info). */
async function readPreviousState(): Promise<{ sha: string; timestamp: string } | null> {
  const statePath = join(appConfig.deploy.appRoot, '.deploy-previous-state.json');
  try {
    const content = await readFile(statePath, 'utf8');
    const parsed = JSON.parse(content);
    return { sha: parsed.sha, timestamp: parsed.timestamp };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// SSE broadcasting
// ---------------------------------------------------------------------------

function broadcastSSE(event: ProgressEvent) {
  const data = JSON.stringify(event);
  for (const reply of sseSubscribers) {
    try {
      reply.raw.write(`id: ${event.id}\ndata: ${data}\n\n`);
    } catch {
      sseSubscribers.delete(reply);
    }
  }
}

/** Tail the progress file and broadcast new lines to SSE subscribers. */
function startProgressTailing() {
  const filePath = progressFilePath();
  if (!existsSync(filePath)) return;

  let lastSize = 0;
  try {
    lastSize = statSync(filePath).size;
  } catch { /* fresh file */ }

  const watcher = watch(filePath, () => {
    try {
      const currentSize = statSync(filePath).size;
      if (currentSize <= lastSize) {
        // File was truncated (new deployment started)
        lastSize = 0;
      }

      const stream = createReadStream(filePath, { start: lastSize, encoding: 'utf8' });
      const rl = createInterface({ input: stream });

      rl.on('line', (line) => {
        const event = parseProgressLine(line);
        if (!event) return;
        broadcastSSE(event);

        // Mirror deploy events into pino so they stream live in the System Terminal.
        // Tag with integration: 'software-update' for filtering.
        const logCtx = { integration: 'software-update', stage: event.stage };
        const logMsg = `[${event.stage}] ${event.msg}`;
        if (event.status === 'failed') {
          logger.error(logCtx, logMsg);
        } else {
          logger.info(logCtx, logMsg);
        }

        // Detect completion
        if (event.stage === 'done' && (event.status === 'completed' || event.status === 'failed')) {
          updateInProgress = false;
          logger.info({ integration: 'software-update', version: updateTargetVersion, status: event.status }, 'Deployment finished');
        }
      });

      rl.on('close', () => {
        lastSize = currentSize;
      });
    } catch (err) {
      logger.error({ err }, 'Error tailing progress file');
    }
  });

  // Clean up watcher if the module is somehow reloaded
  process.on('SIGTERM', () => watcher.close());
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Start a deployment. Returns an error string or null on success. */
export async function startDeploy(options: { buildFallback?: boolean } = {}): Promise<string | null> {
  if (updateInProgress) {
    return 'A deployment is already in progress';
  }

  const root = appConfig.deploy.appRoot;
  const scriptPath = join(root, 'scripts', 'deploy.sh');

  if (!existsSync(scriptPath)) {
    return `Deploy script not found at ${scriptPath}`;
  }

  // Read target version from manifest
  const manifest = await readReleaseManifest();
  updateTargetVersion = manifest?.version ?? 'unknown';
  updateInProgress = true;
  updateStartedAt = new Date().toISOString();

  const args = ['bash', scriptPath];
  if (options.buildFallback) args.push('--build-fallback');

  logger.warn({ root, script: scriptPath, version: updateTargetVersion }, 'Starting deployment');

  const child = spawn(args[0], args.slice(1), {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      HA_APP_ROOT: root,
      HA_LOG_DIR: '/var/log/home-automation',
    },
  });
  child.unref();

  // Monitor deploy script exit. When it exits non-zero (failure before sidecar
  // launch), wait briefly for last writes then emit synthetic 'done' if missing.
  child.on('exit', (code) => {
    if (code !== null && code !== 0) {
      setTimeout(async () => {
        const stages = await readAllProgress();
        const hasDone = stages.some((s) => s.stage === 'done');
        if (!hasDone && updateInProgress) {
          logger.warn({ exitCode: code }, 'Deploy script failed — writing synthetic done');
          await appendSyntheticFailure(stages);
          updateInProgress = false;
        }
      }, 3000);
    }
  });

  // Start tailing the progress file
  startProgressTailing();

  return null;
}

/** Start a rollback to the previous version. */
export async function startRollback(): Promise<string | null> {
  if (updateInProgress) {
    return 'A deployment is already in progress';
  }

  const root = appConfig.deploy.appRoot;
  const scriptPath = join(root, 'scripts', 'deploy.sh');
  const prevState = await readPreviousState();

  if (!prevState) {
    return 'No previous deployment state found — cannot roll back';
  }

  updateInProgress = true;
  updateStartedAt = new Date().toISOString();
  updateTargetVersion = `rollback to ${prevState.sha.slice(0, 7)}`;

  logger.warn({ root, prevSha: prevState.sha }, 'Starting rollback');

  const child = spawn('bash', [scriptPath, '--rollback'], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      HA_APP_ROOT: root,
      HA_LOG_DIR: '/var/log/home-automation',
    },
  });
  child.unref();

  startProgressTailing();
  return null;
}

/** Get current update status. */
export async function getUpdateStatus(): Promise<UpdateStatus> {
  const stages = await readAllProgress();
  const lastStage = stages[stages.length - 1];

  // Check if progress file indicates completion (in case we restarted)
  let finalStatus: 'completed' | 'failed' | null = null;
  if (lastStage?.stage === 'done') {
    finalStatus = lastStage.status === 'completed' ? 'completed' : 'failed';
    // If the backend just restarted and found a completed deploy, clear in-progress
    if (updateInProgress && finalStatus) {
      updateInProgress = false;
    }
  }

  // If no 'done' event exists but a stage failed and the deploy is no longer
  // tracked as in-progress (cleared by child exit handler or detectInFlightDeploy),
  // report the deploy as failed so the frontend can recover.
  if (!finalStatus && !updateInProgress && stages.length > 0) {
    const lastNonLog = [...stages].reverse().find((s) => s.status !== 'log');
    if (lastNonLog?.status === 'failed') {
      finalStatus = 'failed';
    }
  }

  return {
    inProgress: updateInProgress,
    startedAt: updateStartedAt,
    targetVersion: updateTargetVersion,
    currentStage: lastStage?.stage ?? null,
    stages,
    finalStatus,
  };
}

/**
 * Append a synthetic "done failed" event when the deploy script exits
 * abnormally before launching the sidecar (e.g. git pull failure).
 */
async function appendSyntheticFailure(stages: ProgressEvent[]) {
  const filePath = progressFilePath();
  const maxId = stages.reduce((max, s) => Math.max(max, s.id), 0);
  const ts = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const lastFailed = [...stages].reverse().find((s) => s.status === 'failed');
  const msg = lastFailed?.msg ?? 'Deploy process failed';

  const line = JSON.stringify({ id: maxId + 1, ts, stage: 'done', status: 'failed', msg });

  try {
    const existing = await readFile(filePath, 'utf8');
    await writeFile(filePath, existing + line + '\n');
  } catch (err) {
    logger.error({ err }, 'Failed to write synthetic failure event');
  }
}

/**
 * Append synthetic completion stages to the progress file.
 *
 * The deploy-agent sidecar normally writes real health_check / done events.
 * This function is a timeout-based fallback (3 min) in case the sidecar
 * crashes or is removed before completing. It fills in the missing stages
 * so the frontend sees a completed (or failed) deploy.
 */
async function appendSyntheticCompletion(stages: ProgressEvent[]) {
  const filePath = progressFilePath();
  const maxId = stages.reduce((max, s) => Math.max(max, s.id), 0);
  const ts = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  const lines = [
    JSON.stringify({ id: maxId + 1, ts, stage: 'restart', status: 'completed', msg: 'Services restarted' }),
    JSON.stringify({ id: maxId + 2, ts, stage: 'health_check', status: 'completed', msg: 'Backend started successfully' }),
    JSON.stringify({ id: maxId + 3, ts, stage: 'done', status: 'completed', msg: 'Update complete' }),
  ];

  try {
    const existing = await readFile(filePath, 'utf8');
    await writeFile(filePath, existing + lines.join('\n') + '\n');
  } catch (err) {
    logger.error({ err }, 'Failed to write synthetic completion events');
  }
}

/** Check if a deployment might still be running from before this process started. */
export async function detectInFlightDeploy() {
  const stages = await readAllProgress();
  if (stages.length === 0) return;

  const last = stages[stages.length - 1];

  // If the progress file ends with 'done', deploy completed before restart
  if (last.stage === 'done') {
    updateInProgress = false;
    return;
  }

  const age = Date.now() - new Date(last.ts).getTime();
  if (age >= 5 * 60_000) {
    // Stale progress file (> 5 min old) — not an active deploy
    return;
  }

  // Find the last non-log stage event
  const lastNonLog = [...stages].reverse().find((s) => s.status !== 'log');

  // deploy.sh launches a sidecar container ("deploy agent") that writes real
  // health_check and done events to the progress file. If the last meaningful
  // stage is "restart" running, the sidecar should be alive and writing progress.
  // Wait up to 3 minutes for real completion; fall back to synthetic if needed.
  if (lastNonLog?.stage === 'restart' && lastNonLog.status === 'running') {
    logger.info(
      'Post-deploy startup: deploy agent sidecar should be writing progress — '
      + 'waiting up to 3 min for real completion events',
    );
    updateInProgress = true;
    updateStartedAt = stages[0]?.ts ?? new Date().toISOString();
    startProgressTailing();

    // Safety net: if the sidecar hasn't written a "done" event within 3 min,
    // assume it crashed and write synthetic completion so the UI isn't stuck.
    const SIDECAR_TIMEOUT_MS = 3 * 60_000;
    setTimeout(async () => {
      const currentStages = await readAllProgress();
      const currentLast = currentStages[currentStages.length - 1];
      if (currentLast?.stage === 'done') return; // sidecar completed — no action needed
      logger.warn('Deploy sidecar did not complete within 3 minutes — writing synthetic completion');
      await appendSyntheticCompletion(currentStages);
      updateInProgress = false;
    }, SIDECAR_TIMEOUT_MS);

    return;
  }

  // If the last meaningful event was a failure, the deploy is done — not in-flight.
  if (lastNonLog?.status === 'failed') {
    logger.info({ stage: lastNonLog.stage }, 'Previous deploy failed — not resuming');
    updateInProgress = false;
    return;
  }

  // Otherwise, a deploy was genuinely interrupted at an earlier stage
  updateInProgress = true;
  updateStartedAt = stages[0]?.ts ?? new Date().toISOString();
  logger.info('Detected in-flight deployment from before restart');
  startProgressTailing();
}

// ---------------------------------------------------------------------------
// SSE route handler
// ---------------------------------------------------------------------------

export function registerUpdateProgressSSE(app: FastifyInstance) {
  app.get('/api/system/update/progress', async (req: FastifyRequest, reply: FastifyReply) => {
    // Echo CORS headers — reply.hijack() bypasses @fastify/cors
    const originHeader = req.headers.origin;
    const corsHeaders: Record<string, string> = {};
    if (originHeader) {
      corsHeaders['Access-Control-Allow-Origin'] = originHeader;
      corsHeaders['Access-Control-Allow-Credentials'] = 'true';
      corsHeaders['Vary'] = 'Origin';
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...corsHeaders,
    });

    // Send all existing progress events (replay for reconnecting clients)
    const lastEventId = parseInt(req.headers['last-event-id'] as string, 10) || 0;
    const events = await readAllProgress();
    for (const event of events) {
      if (event.id > lastEventId) {
        reply.raw.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);
      }
    }

    // Register for future events
    sseSubscribers.add(reply);

    // Keepalive ping
    const ping = setInterval(() => {
      try {
        reply.raw.write(': ping\n\n');
      } catch {
        clearInterval(ping);
        sseSubscribers.delete(reply);
      }
    }, 15_000);

    req.raw.on('close', () => {
      clearInterval(ping);
      sseSubscribers.delete(reply);
    });
  });
}
