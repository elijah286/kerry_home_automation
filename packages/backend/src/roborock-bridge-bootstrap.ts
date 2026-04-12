// ---------------------------------------------------------------------------
// Ensure services/roborock-bridge has a working venv + pip dependencies
// ---------------------------------------------------------------------------

import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { logger } from './logger.js';

const MIN_BRIDGE: [number, number] = [3, 9];
const PREFER_MAPS: [number, number] = [3, 11];

function cmpVer(a: [number, number], b: [number, number]): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  return a[1] - b[1];
}

function gte(a: [number, number], b: [number, number]): boolean {
  return cmpVer(a, b) >= 0;
}

async function runProc(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv },
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const child = spawn(cmd, args, {
      ...opts,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...opts.env },
    });
    child.stdout?.on('data', (b: Buffer) => out.push(b));
    child.stderr?.on('data', (b: Buffer) => err.push(b));
    child.on('error', reject);
    child.on('close', (code) => {
      resolvePromise({
        code: code ?? 1,
        stdout: Buffer.concat(out).toString('utf8').trim(),
        stderr: Buffer.concat(err).toString('utf8').trim(),
      });
    });
  });
}

async function probePythonVersion(exe: string, extraArgs: string[] = []): Promise<[number, number] | null> {
  const r = await runProc(exe, [...extraArgs, '-c', 'import sys; print(f"{sys.version_info[0]}.{sys.version_info[1]}")'], {});
  if (r.code !== 0) return null;
  const parts = r.stdout.split('.');
  const major = parseInt(parts[0] ?? '', 10);
  const minor = parseInt(parts[1] ?? '', 10);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return null;
  return [major, minor];
}

/** macOS Homebrew and common install locations (not always on PATH). */
function darwinPythonCandidates(): string[] {
  return [
    '/opt/homebrew/bin/python3.13',
    '/opt/homebrew/bin/python3.12',
    '/opt/homebrew/bin/python3.11',
    '/usr/local/bin/python3.13',
    '/usr/local/bin/python3.12',
    '/usr/local/bin/python3.11',
  ];
}

async function findBestHostPython(): Promise<{ exe: string; extraArgs: string[]; ver: [number, number] } | null> {
  type Cand = { exe: string; extraArgs: string[] };
  const cands: Cand[] = [];

  if (process.platform === 'win32') {
    for (const tag of ['-3.13', '-3.12', '-3.11', '-3.10', '-3']) {
      cands.push({ exe: 'py', extraArgs: [tag] });
    }
    cands.push({ exe: 'python3', extraArgs: [] }, { exe: 'python', extraArgs: [] });
  } else {
    for (const p of darwinPythonCandidates()) {
      if (existsSync(p)) cands.push({ exe: p, extraArgs: [] });
    }
    for (const name of ['python3.13', 'python3.12', 'python3.11', 'python3.10', 'python3']) {
      cands.push({ exe: name, extraArgs: [] });
    }
  }

  let best: { exe: string; extraArgs: string[]; ver: [number, number] } | null = null;
  for (const { exe, extraArgs } of cands) {
    const ver = await probePythonVersion(exe, extraArgs);
    if (!ver || !gte(ver, MIN_BRIDGE)) continue;
    if (!best || cmpVer(ver, best.ver) > 0) {
      best = { exe, extraArgs, ver };
    }
  }

  if (!best) return null;

  const mapsOk = gte(best.ver, PREFER_MAPS);
  if (!mapsOk) {
    logger.warn(
      { python: best.exe, version: `${best.ver[0]}.${best.ver[1]}` },
      'Roborock: Python <3.11 — cloud login works; floor-plan maps need Python 3.11+ (e.g. brew install python@3.12)',
    );
  }

  return { exe: best.exe, extraArgs: best.extraArgs, ver: best.ver };
}

function resolveVenvPython(bridgeDir: string): string {
  if (process.platform === 'win32') {
    return resolve(bridgeDir, '.venv/Scripts/python.exe');
  }
  const p3 = resolve(bridgeDir, '.venv/bin/python3');
  if (existsSync(p3)) return p3;
  return resolve(bridgeDir, '.venv/bin/python');
}

function resolveVenvPip(bridgeDir: string): string {
  if (process.platform === 'win32') {
    return resolve(bridgeDir, '.venv/Scripts/pip.exe');
  }
  const pip3 = resolve(bridgeDir, '.venv/bin/pip3');
  if (existsSync(pip3)) return pip3;
  return resolve(bridgeDir, '.venv/bin/pip');
}

async function venvImportsOk(venvPy: string, bridgeDir: string): Promise<boolean> {
  const r = await runProc(
    venvPy,
    ['-c', 'import fastapi, uvicorn; import roborock'],
    { cwd: bridgeDir },
  );
  return r.code === 0;
}

/**
 * Create `.venv` under `bridgeDir` if missing or broken, then `pip install -r requirements.txt`.
 * @returns Path to python inside the venv (used to spawn uvicorn).
 */
export async function ensureRoborockBridgeVenv(bridgeDir: string): Promise<string> {
  const venvPy = resolveVenvPython(bridgeDir);
  if (existsSync(venvPy) && (await venvImportsOk(venvPy, bridgeDir))) {
    logger.info('Roborock: bridge virtualenv already has dependencies');
    return venvPy;
  }

  if (existsSync(resolve(bridgeDir, '.venv'))) {
    logger.warn('Roborock: bridge .venv exists but imports failed — recreating virtualenv');
    try {
      rmSync(resolve(bridgeDir, '.venv'), { recursive: true, force: true });
    } catch (e) {
      logger.error({ err: String(e) }, 'Roborock: could not remove broken .venv');
      throw new Error('Remove services/roborock-bridge/.venv manually and restart the backend.');
    }
  }

  const host = await findBestHostPython();
  if (!host) {
    throw new Error(
      'No Python 3.9+ on PATH. Install Python (3.11+ recommended for maps): https://www.python.org/downloads/ or brew install python@3.12',
    );
  }

  logger.info(
    { interpreter: host.exe, extraArgs: host.extraArgs, version: `${host.ver[0]}.${host.ver[1]}` },
    'Roborock: creating virtualenv and installing bridge packages (first run: several minutes)',
  );

  let r = await runProc(host.exe, [...host.extraArgs, '-m', 'venv', '.venv'], { cwd: bridgeDir });
  if (r.code !== 0) {
    throw new Error(`python -m venv failed: ${r.stderr || r.stdout || 'unknown error'}`);
  }

  const pip = resolveVenvPip(bridgeDir);
  if (!existsSync(pip)) {
    throw new Error(`pip not found at ${pip} after venv creation`);
  }

  r = await runProc(pip, ['install', '--upgrade', 'pip', 'setuptools', 'wheel'], { cwd: bridgeDir });
  if (r.code !== 0) {
    logger.warn({ stderr: r.stderr.slice(-1500) }, 'Roborock: pip upgrade produced warnings');
  }

  logger.info('Roborock: pip install -r requirements.txt (this can take several minutes the first time)');
  const heartbeat = setInterval(() => {
    logger.info('Roborock: pip install still running…');
  }, 45_000);
  try {
    r = await runProc(pip, ['install', '-r', 'requirements.txt'], { cwd: bridgeDir });
  } finally {
    clearInterval(heartbeat);
  }
  if (r.code !== 0) {
    throw new Error(`pip install -r requirements.txt failed:\n${r.stderr.slice(-4000)}`);
  }

  const finalPy = resolveVenvPython(bridgeDir);
  if (!(await venvImportsOk(finalPy, bridgeDir))) {
    throw new Error('Bridge venv created but imports still fail after pip install');
  }

  logger.info('Roborock: bridge virtualenv ready');
  return finalPy;
}
