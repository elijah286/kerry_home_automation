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

/** Version from the mounted workspace (matches running frontend after rebuild), not the baked UI bundle. */
async function readAppVersionFromWorkspace(
  root: string,
): Promise<(AppVersionMeta & { major: number; minor: number; patch: number }) | null> {
  try {
    const raw = await readFile(join(root, APP_VERSION_JSON_PATH), 'utf8');
    return parseAppVersionJson(raw);
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
    // Fallback for pre-CI containers: read from the mounted workspace.
    // NOTE: this may be wrong after `git pull` without a container rebuild.
    const root = appConfig.deploy.appRoot;
    const meta = await readAppVersionFromWorkspace(root);
    if (!meta) {
      return reply.code(503).send({ error: 'app-version.json not readable (configure HA_APP_ROOT mount).' });
    }
    return {
      versionLabel: meta.versionLabel,
      major: meta.major,
      minor: meta.minor,
      patch: meta.patch,
    };
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
      // Read the CI release manifest from origin/main.  This file is committed
      // by the GitHub Actions workflow ONLY after all Docker images have been
      // built and pushed to ghcr.io.  By basing the "update available" decision
      // on the manifest version (not app-version.json), we avoid advertising
      // an update before the images are actually available to pull.
      // -----------------------------------------------------------------------
      const manifest = await readReleaseManifestAtRef(root, 'origin/main');
      const remoteMeta: { versionLabel: string | null; description: string } = manifest
        ? {
            versionLabel: manifest.version,
            description:
              (await readCommitSubject(root, manifest.sha).catch(() => '')).trim() ||
              manifest.version,
          }
        : await describeDeployRef(root, 'origin/main');

      // -----------------------------------------------------------------------
      // Determine the ACTUAL running container version.
      //
      // buildInfo.version comes from /app/build-info.json which is baked into the
      // Docker image at build time. It doesn't change when the host runs `git pull`.
      //
      // When buildInfo is unavailable (pre-CI containers), we fall back to git HEAD
      // which may be inaccurate if git was pulled without rebuilding containers.
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
        // Fallback for pre-CI containers
        const headMeta = await describeDeployRef(root, 'HEAD');
        runningVersionLabel = headMeta.versionLabel;
        runningSha = headSha;
        runningDescription = headMeta.description;
      }

      // -----------------------------------------------------------------------
      // Decide whether an update is available.
      // -----------------------------------------------------------------------
      let updateAvailable: boolean;
      if (containerVersionKnown && remoteMeta.versionLabel) {
        // Reliable: compare the baked container version vs the remote version
        updateAvailable = buildInfo.version !== remoteMeta.versionLabel;
      } else {
        // Fallback: compare git SHAs (may be wrong after git pull without rebuild)
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
