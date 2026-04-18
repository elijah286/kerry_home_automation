// ---------------------------------------------------------------------------
// System telemetry + service control routes — admin only
// ---------------------------------------------------------------------------

import { execFile, spawn } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { constants, statSync } from 'node:fs';
import { join } from 'node:path';
import * as os from 'node:os';
import type { FastifyInstance } from 'fastify';
import { Permission } from '@ha/shared';
import { appConfig } from '../config.js';
import { logger } from '../logger.js';
import { requirePermission, requireRole } from './auth.js';
import { automationEngine } from '../automations/engine.js';
import { getLogEntries, subscribeLogs, type LogEntry } from '../log-buffer.js';
import { gitProcessEnv } from '../git-env.js';
import { buildInfo } from '../build-version.js';
import {
  startDeploy,
  startRollback,
  getUpdateStatus,
  detectInFlightDeploy,
  registerUpdateProgressSSE,
} from './update-orchestrator.js';

const adminOnly = [requireRole('admin')];
const terminalAccess = [requirePermission(Permission.ViewSystemTerminal)];

const UPDATE_LOG_PATH = '/var/log/home-automation/update.log';
const LOG_LINES_TO_RETURN = 100;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sample CPU utilisation over a 200ms window, averaged across all cores. */
async function getCpuPercent(): Promise<number> {
  const sample = () =>
    os.cpus().map((c) => ({ ...c.times }));

  const t1 = sample();
  await new Promise<void>((r) => setTimeout(r, 200));
  const t2 = sample();

  let totalIdle = 0;
  let totalTick = 0;

  for (let i = 0; i < t1.length; i++) {
    const idle = t2[i].idle - t1[i].idle;
    const tick =
      Object.values(t2[i]).reduce((a, b) => a + b, 0) -
      Object.values(t1[i]).reduce((a, b) => a + b, 0);
    totalIdle += idle;
    totalTick += tick;
  }

  return totalTick === 0 ? 0 : Math.round(((totalTick - totalIdle) / totalTick) * 100);
}

/** Run `df -B1 <path>` and return used/total bytes. */
async function getDiskBytes(path: string): Promise<{ used: number; total: number }> {
  return new Promise((resolve) => {
    execFile('df', ['-B1', path], (err, stdout) => {
      if (err) {
        resolve({ used: 0, total: 0 });
        return;
      }
      const lines = stdout.trim().split('\n');
      const parts = lines[1]?.split(/\s+/) ?? [];
      // df output: Filesystem 1B-blocks Used Available Use% Mountpoint
      const total = parseInt(parts[1] ?? '0', 10);
      const used = parseInt(parts[2] ?? '0', 10);
      resolve({ used, total });
    });
  });
}

/** Execute a docker compose command against the production compose file. */
function dockerCompose(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      'docker',
      ['compose', '-f', appConfig.serverInstaller.prodComposePath, ...args],
      { timeout: 60_000 },
      (err, _stdout, stderr) => {
        if (err) {
          reject(new Error(stderr || err.message));
        } else {
          resolve();
        }
      },
    );
  });
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Mounted checkout may be owned by host uid ≠ container uid (Git 2.35+ "dubious ownership").
 * See git-env.ts — HOME=/root + Dockerfile /root/.gitconfig; do not set GIT_CONFIG_GLOBAL to a missing file.
 */
function gitTrustArgs(cwd: string): string[] {
  return ['-c', 'safe.directory=*', '-c', `safe.directory=${cwd}`];
}

function execGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      [...gitTrustArgs(cwd), ...args],
      { cwd, timeout: 120_000, maxBuffer: 4_000_000, env: gitProcessEnv() },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr.trim() || err.message));
        } else {
          resolve(stdout.trim());
        }
      },
    );
  });
}

/**
 * The backend runs as root inside the container but the git checkout is a
 * bind-mount owned by the host user. `git fetch` creates objects as root,
 * which prevents the host user from running git directly later.
 * Restore .git ownership after fetch operations.
 */
function fixGitOwner(cwd: string): void {
  try {
    const st = statSync(cwd);
    // Only fix if the repo root is NOT owned by root (i.e. it's a host mount)
    if (st.uid !== 0) {
      execFile('chown', ['-R', `${st.uid}:${st.gid}`, join(cwd, '.git')], { timeout: 10_000 }, () => {});
    }
  } catch {
    // Best-effort — don't break the update check if this fails
  }
}

function formatGitErrorForClient(err: unknown, _repoRoot: string): string {
  return err instanceof Error ? err.message : String(err);
}

/** Same path as the UI bundle version (`packages/frontend/src/lib/appVersion.ts`). */
const APP_VERSION_JSON_PATH = 'packages/frontend/src/lib/app-version.json';

/**
 * CI-generated manifest committed only AFTER all images are built and pushed.
 * Using this to determine remote version avoids advertising updates before
 * Docker images are actually available on ghcr.io.
 */
const RELEASE_MANIFEST_PATH = 'deploy/release-manifest.json';

interface ReleaseManifest {
  version: string;
  sha: string;
  shaShort: string;
  timestamp: string;
  images: Record<string, string>;
}

async function readReleaseManifestAtRef(root: string, ref: string): Promise<ReleaseManifest | null> {
  try {
    const raw = await execGit(['show', `${ref}:${RELEASE_MANIFEST_PATH}`], root);
    const j = JSON.parse(raw) as ReleaseManifest;
    if (!j.version || !j.sha) return null;
    return j;
  } catch {
    return null;
  }
}

interface AppVersionMeta {
  versionLabel: string;
  releaseNotes?: string;
}

/** Parsed `app-version.json` (git blob or workspace file). */
function parseAppVersionJson(raw: string): (AppVersionMeta & { major: number; minor: number; patch: number }) | null {
  const j = JSON.parse(raw) as {
    major?: unknown;
    minor?: unknown;
    patch?: unknown;
    releaseNotes?: unknown;
  };
  if (typeof j.major !== 'number' || typeof j.minor !== 'number' || typeof j.patch !== 'number') {
    return null;
  }
  const versionLabel = `v${j.major}.${j.minor}.${j.patch}`;
  const releaseNotes =
    typeof j.releaseNotes === 'string' && j.releaseNotes.trim() ? j.releaseNotes.trim() : undefined;
  return { versionLabel, major: j.major, minor: j.minor, patch: j.patch, releaseNotes };
}

async function readAppVersionMetaAtRef(root: string, ref: string): Promise<AppVersionMeta | null> {
  try {
    const raw = await execGit(['show', `${ref}:${APP_VERSION_JSON_PATH}`], root);
    const p = parseAppVersionJson(raw);
    if (!p) return null;
    return { versionLabel: p.versionLabel, releaseNotes: p.releaseNotes };
  } catch {
    return null;
  }
}

async function readCommitSubject(root: string, ref: string): Promise<string> {
  try {
    return await execGit(['log', '-1', '--format=%s', ref], root);
  } catch {
    return '';
  }
}

/** Version label from app-version.json; description = optional releaseNotes else latest commit subject (PR title on squash merges). */
async function describeDeployRef(
  root: string,
  ref: string,
): Promise<{ versionLabel: string | null; description: string }> {
  const meta = await readAppVersionMetaAtRef(root, ref);
  const subject = (await readCommitSubject(root, ref)).trim();
  const versionLabel = meta?.versionLabel ?? null;
  const description = meta?.releaseNotes ?? (subject || '—');
  return { versionLabel, description };
}

interface VersionBumpSegment {
  hash: string;
  versionLabel: string;
  description: string;
  date: string;
}

/** Commits in `range` (e.g. HEAD..origin/main) where app-version.json version changed vs parent, oldest → newest. */
async function getVersionBumpSegmentsInRange(root: string, range: string): Promise<VersionBumpSegment[]> {
  let logOut: string;
  try {
    logOut = await execGit(['log', '--no-color', '--reverse', '--format=%H%x09%ci', range], root);
  } catch {
    return [];
  }
  const segments: VersionBumpSegment[] = [];
  for (const line of logOut.split('\n')) {
    if (!line.trim()) continue;
    const [hash, date] = line.split('\t');
    if (!hash || !date) continue;
    let parentSha: string;
    try {
      parentSha = await execGit(['rev-parse', `${hash}^`], root);
    } catch {
      continue;
    }
    const vCur = await readAppVersionMetaAtRef(root, hash);
    const vPar = await readAppVersionMetaAtRef(root, parentSha);
    const curLabel = vCur?.versionLabel ?? null;
    const parLabel = vPar?.versionLabel ?? null;
    if (curLabel && curLabel !== parLabel) {
      const subject = (await readCommitSubject(root, hash)).trim();
      const description = vCur?.releaseNotes ?? subject;
      segments.push({ hash, versionLabel: curLabel, description, date });
    }
  }
  return segments;
}

function formatCombinedUpgradeSummary(segments: VersionBumpSegment[]): string {
  if (segments.length === 0) return '';
  return segments
    .map((s) => {
      const when = s.date.trim();
      return `${s.versionLabel} (${when})\n${s.description}`;
    })
    .join('\n\n');
}

interface ListedRelease {
  sha: string;
  versionLabel: string;
  description: string;
  date: string;
}

/** Recent version bumps on origin/main (newest first), for revert dropdown. */
async function listRecentReleases(root: string, max: number): Promise<ListedRelease[]> {
  const revs = (await execGit(['rev-list', '--max-count=150', 'origin/main'], root))
    .split('\n')
    .filter(Boolean);
  const out: ListedRelease[] = [];
  for (const sha of revs) {
    if (out.length >= max) break;
    let parentSha: string;
    try {
      parentSha = await execGit(['rev-parse', `${sha}^`], root);
    } catch {
      continue;
    }
    const vCur = await readAppVersionMetaAtRef(root, sha);
    const vPar = await readAppVersionMetaAtRef(root, parentSha);
    if (!vCur?.versionLabel) continue;
    if (vCur.versionLabel === vPar?.versionLabel) continue;
    const subject = (await readCommitSubject(root, sha)).trim();
    const date = (await execGit(['log', '-1', '--format=%ci', sha], root)).trim();
    out.push({
      sha,
      versionLabel: vCur.versionLabel,
      description: vCur.releaseNotes ?? subject,
      date,
    });
  }
  return out;
}

/** True if `ancestor` is an ancestor of `descendant` (reachable). */
async function gitIsAncestor(root: string, ancestor: string, descendant: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      'git',
      [...gitTrustArgs(root), 'merge-base', '--is-ancestor', ancestor, descendant],
      { cwd: root, env: gitProcessEnv() },
      (err) => resolve(!err),
    );
  });
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerSystemRoutes(app: FastifyInstance): void {

  // GET /api/system/app-version — the *running* container version; public for header badge.
  // Prefers the build-time version baked into the Docker image (build-info.json) so that
  // a `git pull` on the host doesn't make the header show a version the containers aren't
  // actually running.
  app.get('/api/system/app-version', async (_req, reply) => {
    if (buildInfo.version) {
      const parts = buildInfo.version.replace(/^v/, '').split('.');
      return {
        versionLabel: buildInfo.version,
        major: parseInt(parts[0] ?? '0', 10),
        minor: parseInt(parts[1] ?? '0', 10),
        patch: parseInt(parts[2] ?? '0', 10),
      };
    }
    // We intentionally do NOT fall back to reading app-version.json from the
    // mounted workspace — that reflects git state (which can drift via `git
    // pull` or CI-commit), NOT what Docker is actually running. Lying about
    // the running version breaks the whole update-detection flow. Instead,
    // honestly report the version as unknown so the UI can say so clearly.
    return reply.code(503).send({
      error: 'Running container version is unknown (no build-info, OCI labels, or pinned HA_BACKEND_IMAGE). Install an update to refresh this.',
      versionLabel: null,
    });
  });

  // GET /api/system/stats
  app.get('/api/system/stats', { preHandler: adminOnly }, async (_req, reply) => {
    try {
      const [cpuPercent, disk] = await Promise.all([
        getCpuPercent(),
        getDiskBytes('/'),
      ]);

      const totalMem = os.totalmem();
      const freeMem = os.freemem();

      return {
        cpu: {
          percent: cpuPercent,
          cores: os.cpus().length,
          model: os.cpus()[0]?.model ?? 'Unknown',
        },
        memory: {
          used: totalMem - freeMem,
          total: totalMem,
          percent: Math.round(((totalMem - freeMem) / totalMem) * 100),
        },
        disk: {
          used: disk.used,
          total: disk.total,
          percent: disk.total > 0 ? Math.round((disk.used / disk.total) * 100) : 0,
        },
        uptime: Math.floor(os.uptime()),
        platform: `${os.platform()} ${os.release()}`,
        hostname: os.hostname(),
      };
    } catch (err) {
      logger.error({ err }, 'Failed to collect system stats');
      return reply.code(500).send({ error: 'Failed to collect system stats' });
    }
  });

  // GET /api/system/logs — recent backend log lines (system terminal)
  app.get('/api/system/logs', { preHandler: terminalAccess }, async () => {
    return { entries: getLogEntries() };
  });

  // POST /api/system/log — push a log line from the frontend into the status
  // window (e.g. camera tier failures). Frontend-originated so severity is
  // limited to info|warn|error, and the message is bounded to 500 chars.
  app.post<{ Body: { level?: 'info' | 'warn' | 'error'; source?: string; message?: string; meta?: Record<string, unknown> } }>(
    '/api/system/log',
    { preHandler: terminalAccess },
    async (req, reply) => {
      const body = req.body ?? {};
      const level   = body.level === 'error' || body.level === 'warn' ? body.level : 'info';
      const source  = (body.source ?? 'client').slice(0, 64);
      const message = (body.message ?? '').slice(0, 500);
      if (!message) return reply.code(400).send({ error: 'message required' });
      logger[level]({ source, ...(body.meta ?? {}) }, message);
      return { ok: true };
    },
  );

  // Kick off the system health monitor (CPU / disk alarms → status window).
  startSystemHealthMonitor();

  // GET /api/system/logs/stream — SSE of new log lines after connect
  app.get('/api/system/logs/stream', { preHandler: terminalAccess }, async (req, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const write = (entry: LogEntry) => {
      reply.raw.write(`data: ${JSON.stringify({ type: 'entry', entry })}\n\n`);
    };

    const unsub = subscribeLogs(write);
    const ping = setInterval(() => {
      reply.raw.write(': ping\n\n');
    }, 25_000);

    req.raw.on('close', () => {
      clearInterval(ping);
      unsub();
    });
  });

  // GET /api/system/update/check — git fetch + compare running container version vs origin/main (admin)
  app.get('/api/system/update/check', { preHandler: adminOnly }, async (_req, reply) => {
    const root = appConfig.deploy.appRoot;
    const gitDir = join(root, '.git');
    if (!(await pathExists(gitDir))) {
      return {
        checkSupported: false,
        reason: 'Server git checkout not mounted (set HA_APP_ROOT / compose volumes).',
        updateAvailable: false,
      };
    }
    try {
      await execGit(['fetch', 'origin', 'main'], root);
      fixGitOwner(root);
      const headSha = await execGit(['rev-parse', 'HEAD'], root);
      const remoteSha = await execGit(['rev-parse', 'origin/main'], root);

      // -----------------------------------------------------------------------
      // Remote version label for DISPLAY: always from app-version.json at
      // origin/main, so the UI never shows an older label than the code
      // that's actually on the remote branch.
      //
      // We still read `deploy/release-manifest.json` from origin/main — but
      // only as an "images are ready" signal. That manifest is committed by
      // the GitHub Actions workflow AFTER all Docker images land on ghcr.io,
      // so its presence gates whether we're willing to offer an update at
      // all. Its version string is no longer surfaced to the UI because the
      // manifest commit can lag behind origin/main (e.g. when the manifest
      // write itself fails in CI) — and displaying a stale version next to
      // the current running version is just confusing.
      // -----------------------------------------------------------------------
      const manifest = await readReleaseManifestAtRef(root, 'origin/main');
      const remoteMeta = await describeDeployRef(root, 'origin/main');

      // -----------------------------------------------------------------------
      // Determine the ACTUAL running container version.
      //
      // buildInfo is resolved from /app/build-info.json, then OCI image labels
      // (org.opencontainers.image.*), then optional HA_CONTAINER_* env — see build-version.ts.
      //
      // When all of those are unavailable, we fall back to git HEAD + workspace
      // app-version.json, which may be inaccurate if git was pulled without redeploying images.
      // -----------------------------------------------------------------------
      let runningSha: string;
      let runningVersionLabel: string | null;
      let runningDescription: string;
      const containerVersionKnown = !!buildInfo.version;

      if (buildInfo.version) {
        runningVersionLabel = buildInfo.version;
        runningSha = buildInfo.sha || headSha;
        // Try to get the commit description for the running SHA
        if (buildInfo.sha) {
          try {
            runningDescription = (await readCommitSubject(root, buildInfo.sha)).trim() || buildInfo.version;
          } catch {
            runningDescription = buildInfo.version;
          }
        } else {
          runningDescription = buildInfo.version;
        }
      } else {
        // No reliable running-version source (no build-info.json, OCI labels, env,
        // or pinned HA_BACKEND_IMAGE). DO NOT fall back to reading app-version.json
        // from the mounted workspace — that reflects git state, not what Docker is
        // actually running. Report null so the UI can clearly show "unknown".
        runningVersionLabel = null;
        runningSha = headSha;
        runningDescription = 'Running container version unknown — install an update to refresh.';
      }

      // -----------------------------------------------------------------------
      // Decide whether an update is available.
      //
      // Hard guards applied first:
      //   1. If the server's git HEAD is already at origin/main, there is
      //      nothing to install. Never advertise an update in that case —
      //      this prevents the UI from offering a "Re-sync" that would
      //      point at an older manifest or otherwise confuse the user.
      //   2. If the CI release manifest doesn't exist at origin/main, images
      //      haven't been published yet. Don't advertise an update until
      //      they are pullable.
      //
      // After those guards, we still prefer the container-version compare
      // when available (it detects "git pulled but not rebuilt" drift), and
      // fall back to SHA compare otherwise.
      // -----------------------------------------------------------------------
      let updateAvailable: boolean;
      if (!manifest) {
        // CI hasn't published images for origin/main yet — nothing installable.
        updateAvailable = false;
      } else if (containerVersionKnown && remoteMeta.versionLabel) {
        // Best case: compare running container version against remote version.
        // This catches the critical "git pulled but never rebuilt" drift where
        // HEAD == origin/main but the running image is older.
        updateAvailable = buildInfo.version !== remoteMeta.versionLabel;
      } else if (!containerVersionKnown) {
        // Container predates build-info — we can't know what's running.
        // Always offer the update so the user can install a version that WILL
        // report truthfully. Never silently say "up to date" when we don't know.
        updateAvailable = true;
      } else {
        updateAvailable = headSha !== remoteSha;
      }

      // -----------------------------------------------------------------------
      // Collect commit list when there's something new on origin/main
      // -----------------------------------------------------------------------
      const commits: { hash: string; subject: string; date: string }[] = [];
      let versionBumpSegments: VersionBumpSegment[] = [];
      let combinedUpgradeSummary = '';

      // Use the running SHA as the base (not HEAD) so we show all commits since the container was built
      const rangeBase = buildInfo.sha || headSha;
      const rangeExpr = `${rangeBase}..origin/main`;

      if (updateAvailable) {
        try {
          const logOut = await execGit(
            ['log', '--no-color', '-n', '40', '--format=%H%x09%s%x09%ci', rangeExpr],
            root,
          );
          for (const line of logOut.split('\n')) {
            if (!line.trim()) continue;
            const [hash, subject, date] = line.split('\t');
            if (hash && subject && date) {
              commits.push({ hash, subject, date });
            }
          }
        } catch {
          // The build SHA might not be in the local checkout (shallow fetch); fall back to HEAD range
          if (rangeBase !== headSha) {
            try {
              const logOut = await execGit(
                ['log', '--no-color', '-n', '40', '--format=%H%x09%s%x09%ci', `HEAD..origin/main`],
                root,
              );
              for (const line of logOut.split('\n')) {
                if (!line.trim()) continue;
                const [hash, subject, date] = line.split('\t');
                if (hash && subject && date) {
                  commits.push({ hash, subject, date });
                }
              }
            } catch { /* no commits to list */ }
          }
        }

        try {
          versionBumpSegments = await getVersionBumpSegmentsInRange(root, rangeExpr);
        } catch {
          // Gracefully degrade if the range doesn't resolve
        }
        combinedUpgradeSummary = formatCombinedUpgradeSummary(versionBumpSegments);
        if (!combinedUpgradeSummary.trim() && commits.length > 0) {
          combinedUpgradeSummary = commits
            .slice()
            .reverse()
            .map((c) => `${c.subject} (${c.date})`)
            .join('\n');
        }
      }

      return {
        checkSupported: true,
        updateAvailable,
        containerVersionKnown,
        currentSha: headSha,
        remoteSha,
        running: {
          sha: runningSha,
          versionLabel: runningVersionLabel,
          description: runningDescription,
        },
        remote: {
          sha: remoteSha,
          versionLabel: remoteMeta.versionLabel,
          description: remoteMeta.description,
        },
        commits,
        versionBumpSegments,
        combinedUpgradeSummary,
      };
    } catch (err) {
      logger.error({ err }, 'Update check failed');
      return reply.code(503).send({
        error: formatGitErrorForClient(err, root),
      });
    }
  });

  // POST /api/system/update/apply — start a structured deployment via the orchestrator (admin)
  app.post<{ Body: { buildFallback?: boolean } }>(
    '/api/system/update/apply',
    { preHandler: adminOnly },
    async (req, reply) => {
      const buildFallback = req.body?.buildFallback === true;
      const error = await startDeploy({ buildFallback });
      if (error) {
        return reply.code(409).send({ error });
      }
      return reply.code(202).send({
        ok: true,
        message: 'Deployment started. Subscribe to /api/system/update/progress for real-time status.',
      });
    },
  );

  // GET /api/system/update/status — current deployment status (admin)
  app.get('/api/system/update/status', { preHandler: adminOnly }, async () => {
    return getUpdateStatus();
  });

  // GET /api/system/update/progress — SSE stream of deployment progress (admin, handled by orchestrator)
  registerUpdateProgressSSE(app);

  // POST /api/system/update/rollback — rollback to previous version via orchestrator (admin)
  app.post('/api/system/update/rollback', { preHandler: adminOnly }, async (_req, reply) => {
    const error = await startRollback();
    if (error) {
      return reply.code(409).send({ error });
    }
    return reply.code(202).send({
      ok: true,
      message: 'Rollback started. Subscribe to /api/system/update/progress for real-time status.',
    });
  });

  // GET /api/system/update/releases — recent version bumps on origin/main (admin)
  app.get('/api/system/update/releases', { preHandler: adminOnly }, async (_req, reply) => {
    const root = appConfig.deploy.appRoot;
    const gitDir = join(root, '.git');
    if (!(await pathExists(gitDir))) {
      return reply.code(503).send({ error: 'Git checkout not available.' });
    }
    try {
      await execGit(['fetch', 'origin', 'main'], root);
      fixGitOwner(root);
      const runningSha = await execGit(['rev-parse', 'HEAD'], root);
      const releases = await listRecentReleases(root, 28);
      return { runningSha, releases };
    } catch (err) {
      logger.error({ err }, 'List releases failed');
      return reply.code(503).send({
        error: formatGitErrorForClient(err, root),
      });
    }
  });

  // POST /api/system/update/revert — reset checkout to a prior commit and rebuild (admin)
  // Kept for backwards compatibility; prefer /api/system/update/rollback for the orchestrator-based flow.
  app.post<{ Body: { targetSha?: string } }>(
    '/api/system/update/revert',
    { preHandler: adminOnly },
    async (req, reply) => {
      const root = appConfig.deploy.appRoot;
      const targetSha = (req.body?.targetSha ?? '').trim().toLowerCase();

      if (!/^[0-9a-f]{40}$/.test(targetSha)) {
        return reply.code(400).send({ error: 'targetSha must be a full 40-character commit hash.' });
      }

      if (!(await pathExists(join(root, '.git')))) {
        return reply.code(503).send({ error: 'Git checkout not available (configure HA_APP_ROOT).' });
      }

      try {
        await execGit(['fetch', 'origin', 'main'], root);
        fixGitOwner(root);
        const head = await execGit(['rev-parse', 'HEAD'], root);
        const remoteMain = await execGit(['rev-parse', 'origin/main'], root);

        try {
          await execGit(['rev-parse', '--verify', targetSha], root);
        } catch {
          return reply.code(400).send({ error: 'That commit was not found in this repository.' });
        }

        const onMainHistory = await gitIsAncestor(root, targetSha, remoteMain);
        if (!onMainHistory) {
          return reply.code(400).send({
            error: 'That commit is not on origin/main — revert is only allowed for history on main.',
          });
        }

        if (head === targetSha) {
          return reply.code(400).send({ error: 'Already running that commit.' });
        }
      } catch (err) {
        return reply.code(503).send({
          error: formatGitErrorForClient(err, root),
        });
      }

      // Use the orchestrator for the actual rollback
      const error = await startRollback();
      if (error) {
        return reply.code(409).send({ error });
      }
      return reply.code(202).send({
        ok: true,
        message: 'Revert started. Subscribe to /api/system/update/progress for real-time status.',
      });
    },
  );

  // GET /api/system/update-log
  app.get('/api/system/update-log', { preHandler: adminOnly }, async (_req, reply) => {
    try {
      const content = await readFile(UPDATE_LOG_PATH, 'utf8');
      const lines = content.trim().split('\n').slice(-LOG_LINES_TO_RETURN);
      return { lines };
    } catch {
      // Log file doesn't exist yet (server not yet installed, or no updates run)
      return { lines: [] };
    }
  });

  // POST /api/system/restart/backend
  app.post('/api/system/restart/backend', { preHandler: adminOnly }, async (_req, reply) => {
    logger.info('Admin triggered backend restart');
    // Fire and forget — the container will restart, taking this process with it
    setImmediate(() => {
      dockerCompose(['restart', 'backend']).catch((err) =>
        logger.error({ err }, 'Backend restart failed'),
      );
    });
    return reply.code(202).send({ ok: true, message: 'Backend restart initiated' });
  });

  // POST /api/system/restart/frontend
  app.post('/api/system/restart/frontend', { preHandler: adminOnly }, async (_req, reply) => {
    logger.info('Admin triggered frontend restart');
    try {
      await dockerCompose(['restart', 'frontend']);
      return { ok: true, message: 'Frontend restarted' };
    } catch (err) {
      logger.error({ err }, 'Frontend restart failed');
      return reply.code(500).send({ error: (err as Error).message });
    }
  });

  // POST /api/system/restart/hardware
  app.post('/api/system/restart/hardware', { preHandler: adminOnly }, async (_req, reply) => {
    logger.warn('Admin triggered system reboot');
    setImmediate(() => {
      execFile('sudo', ['reboot'], (err) => {
        if (err) logger.error({ err }, 'Reboot command failed');
      });
    });
    return reply.code(202).send({ ok: true, message: 'System reboot initiated' });
  });

  // POST /api/system/reload/automations
  app.post('/api/system/reload/automations', { preHandler: adminOnly }, async () => {
    await automationEngine.reload();
    logger.info('Automations reloaded via system controls');
    return { ok: true, message: 'Automations reloaded' };
  });
}

// ---------------------------------------------------------------------------
// System health monitor — samples CPU + disk on an interval; emits
// logger.error when thresholds are crossed so the status window alarms.
// Dedupes: only emits on state transitions (OK → critical) and every 10 min
// while critical, so we don't flood the log.
// ---------------------------------------------------------------------------

const CPU_CRITICAL_PERCENT = 85;
const DISK_CRITICAL_PERCENT = 90;
const MONITOR_INTERVAL_MS = 30_000;
const RE_ALARM_MS = 10 * 60_000;

interface AlarmState {
  active: boolean;
  lastEmittedAt: number;
}

const alarmState: Record<'cpu' | 'disk', AlarmState> = {
  cpu:  { active: false, lastEmittedAt: 0 },
  disk: { active: false, lastEmittedAt: 0 },
};

let monitorTimer: ReturnType<typeof setInterval> | null = null;

function maybeEmitAlarm(
  key: 'cpu' | 'disk',
  isCritical: boolean,
  message: string,
  meta: Record<string, unknown>,
): void {
  const state = alarmState[key];
  const now = Date.now();

  if (isCritical) {
    const justTransitioned = !state.active;
    const reAlarmDue = now - state.lastEmittedAt >= RE_ALARM_MS;
    if (justTransitioned || reAlarmDue) {
      logger.error({ source: 'system-monitor', alarm: key, ...meta }, message);
      state.lastEmittedAt = now;
    }
    state.active = true;
  } else if (state.active) {
    logger.info({ source: 'system-monitor', alarm: key, ...meta }, `${key.toUpperCase()} back to normal`);
    state.active = false;
    state.lastEmittedAt = 0;
  }
}

async function sampleAndAlarm(): Promise<void> {
  try {
    const [cpuPercent, disk] = await Promise.all([
      getCpuPercent(),
      getDiskBytes('/'),
    ]);

    maybeEmitAlarm(
      'cpu',
      cpuPercent >= CPU_CRITICAL_PERCENT,
      `CPU critical: ${cpuPercent}% across ${os.cpus().length} cores`,
      { percent: cpuPercent, cores: os.cpus().length },
    );

    const diskPercent = disk.total > 0 ? Math.round((disk.used / disk.total) * 100) : 0;
    const freeGb = disk.total > 0 ? Math.round((disk.total - disk.used) / 1e9) : 0;
    maybeEmitAlarm(
      'disk',
      diskPercent >= DISK_CRITICAL_PERCENT,
      `Disk critical: ${diskPercent}% used, ${freeGb} GB free on /`,
      { percent: diskPercent, freeBytes: disk.total - disk.used, totalBytes: disk.total },
    );
  } catch (err) {
    logger.warn({ err, source: 'system-monitor' }, 'System health sample failed');
  }
}

export function startSystemHealthMonitor(): void {
  if (monitorTimer) return;
  // First sample is delayed a few seconds to let the process finish booting.
  setTimeout(() => void sampleAndAlarm(), 5_000);
  monitorTimer = setInterval(() => void sampleAndAlarm(), MONITOR_INTERVAL_MS);
  logger.info({ source: 'system-monitor' }, 'System health monitor started');
}
