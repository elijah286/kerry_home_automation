// ---------------------------------------------------------------------------
// Start the Python roborock-bridge locally when no external URL is configured
// ---------------------------------------------------------------------------

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { logger } from './logger.js';
import { roborockBridgeSettings } from './config.js';
import { ensureRoborockBridgeVenv } from './roborock-bridge-bootstrap.js';

const log = logger.child({ integration: 'roborock' });

const __dirname = dirname(fileURLToPath(import.meta.url));

let managedChild: ChildProcess | null = null;
let managedByServer = false;

/**
 * python-roborock logs MQTT connect/disconnect/protocol noise at WARNING/ERROR on stderr.
 * The backend previously forwarded every stderr line as an app warning — floods the UI during polling.
 */
function logBridgeStderrLine(raw: string): void {
  const t = raw.trim().slice(0, 900);
  if (!t) return;
  const upper = t.toUpperCase();

  if (
    upper.includes('TRACEBACK') ||
    upper.includes('MODULENOTFOUND') ||
    upper.includes('SYNTAXERROR') ||
    upper.includes('EXCEPTION:')
  ) {
    log.warn({ bridge: 'stderr', line: t }, 'roborock-bridge');
    return;
  }

  const mqttOrBrokerChurn =
    upper.includes('ROBOROCK') &&
    (upper.includes('BROKER') ||
      upper.includes('MQTT') ||
      upper.includes('DISCONNECTED') ||
      upper.includes('FAILED TO CONNECT') ||
      upper.includes('PROTOCOL ERROR') ||
      upper.includes('UNKNOWN ERROR') ||
      upper.includes('CLOUD_API'));

  if (mqttOrBrokerChurn || /^INFO:/i.test(t) || /^DEBUG:/i.test(t)) {
    log.debug({ bridge: 'stderr', line: t.slice(0, 500) }, 'roborock-bridge');
    return;
  }

  if (/^WARNING:/i.test(t) || /^ERROR:/i.test(t)) {
    log.info({ bridge: 'stderr', line: t.slice(0, 500) }, 'roborock-bridge');
    return;
  }

  log.debug({ bridge: 'stderr', line: t.slice(0, 500) }, 'roborock-bridge');
}

function repoRootFromDist(): string {
  // dist/ -> packages/backend/dist -> repo root
  return resolve(__dirname, '../../..');
}

function bridgeServiceDir(): string {
  return resolve(repoRootFromDist(), 'services/roborock-bridge');
}

async function pickLoopbackPort(preferred: number): Promise<number> {
  for (let p = preferred; p < preferred + 40; p++) {
    const ok = await new Promise<boolean>((res) => {
      const s = createServer();
      s.once('error', () => res(false));
      s.listen(p, '127.0.0.1', () => {
        s.close(() => res(true));
      });
    });
    if (ok) return p;
  }
  throw new Error(`No free TCP port on 127.0.0.1 in range ${preferred}-${preferred + 39}`);
}

async function waitForHealth(baseUrl: string, maxMs: number): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${baseUrl.replace(/\/$/, '')}/health`);
      if (r.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/**
 * When `ROBOROCK_BRIDGE_URL` is unset, spawn `services/roborock-bridge` on loopback
 * with a random shared secret (no .env required for local cloud login).
 */
export async function startManagedRoborockBridgeIfNeeded(): Promise<void> {
  if (roborockBridgeSettings.baseUrl.trim()) {
    return;
  }

  const bridgeDir = bridgeServiceDir();
  if (!existsSync(resolve(bridgeDir, 'app.py'))) {
    log.warn(
      { bridgeDir },
      'Roborock: managed bridge skipped — services/roborock-bridge not found (use local miIO or set ROBOROCK_BRIDGE_URL)',
    );
    return;
  }

  let python: string;
  try {
    python = await ensureRoborockBridgeVenv(bridgeDir);
  } catch (e) {
    log.error({ err: String(e) }, 'Roborock: could not prepare bridge virtualenv');
    return;
  }

  const secret = randomBytes(24).toString('base64url');
  let port: number;
  try {
    port = await pickLoopbackPort(8765);
  } catch (e) {
    log.error({ err: String(e) }, 'Roborock: could not allocate a port for managed bridge');
    return;
  }

  const baseUrl = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    ROBOROCK_BRIDGE_SECRET: secret,
  };

  const args = ['-m', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', String(port)];

  log.info({ port, bridgeDir }, 'Roborock: starting managed python bridge');

  const proc = spawn(python, args, {
    cwd: bridgeDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  managedChild = proc;
  managedByServer = true;

  proc.stdout?.on('data', (buf: Buffer) => {
    const s = buf.toString().trim();
    if (s) log.debug({ bridge: 'stdout', line: s.slice(0, 500) }, 'roborock-bridge');
  });
  proc.stderr?.on('data', (buf: Buffer) => {
    for (const line of buf.toString().split('\n')) {
      if (line.trim()) logBridgeStderrLine(line);
    }
  });

  proc.on('exit', (code, signal) => {
    managedChild = null;
    const was = managedByServer;
    managedByServer = false;
    if (was) {
      log.warn({ code, signal }, 'Roborock: managed bridge process exited');
      roborockBridgeSettings.baseUrl = (process.env.ROBOROCK_BRIDGE_URL ?? '').trim();
      roborockBridgeSettings.secret = (process.env.ROBOROCK_BRIDGE_SECRET ?? '').trim();
    }
  });

  proc.once('error', (err) => {
    log.error({ err }, 'Roborock: managed bridge spawn error');
  });

  await new Promise((r) => setTimeout(r, 400));
  if (proc.exitCode != null) {
    log.error(
      { exitCode: proc.exitCode },
      'Roborock: managed bridge exited during startup (see roborock-bridge stderr above)',
    );
    managedChild = null;
    managedByServer = false;
    return;
  }

  const alive = await waitForHealth(baseUrl, 45_000);
  if (!alive) {
    log.error('Roborock: managed bridge did not become healthy in time');
    proc.kill('SIGTERM');
    managedChild = null;
    managedByServer = false;
    return;
  }

  roborockBridgeSettings.baseUrl = baseUrl;
  roborockBridgeSettings.secret = secret;
  log.info({ baseUrl: `${baseUrl.replace(/\/$/, '')}` }, 'Roborock: managed bridge is ready');
}

export async function stopManagedRoborockBridge(): Promise<void> {
  if (!managedChild) return;
  const p = managedChild;
  managedChild = null;
  managedByServer = false;
  p.kill('SIGTERM');
  await new Promise<void>((res) => {
    const t = setTimeout(() => {
      p.kill('SIGKILL');
      res();
    }, 5000);
    p.once('exit', () => {
      clearTimeout(t);
      res();
    });
  });
  roborockBridgeSettings.baseUrl = (process.env.ROBOROCK_BRIDGE_URL ?? '').trim();
  roborockBridgeSettings.secret = (process.env.ROBOROCK_BRIDGE_SECRET ?? '').trim();
}
