// ---------------------------------------------------------------------------
// Server installer ISO build pipeline
// ---------------------------------------------------------------------------

import { mkdir, writeFile, readFile, rm, rename, stat, readdir, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { dirname, join, resolve, sep } from 'node:path';
import { createWriteStream } from 'node:fs';
import { get as httpsGet } from 'node:https';
import { get as httpGet } from 'node:http';
import { appConfig } from '../config.js';
import { chmodTreeWritable } from '../lib/chmod-tree-writable.js';
import { generateAutoinstallYaml, hashPasswordForAutoinstall } from './autoinstall.js';
import { logger } from '../logger.js';

/** Used when HTTP has no Content-Length so the bar still moves (~Ubuntu 24.04 server ISO size). */
const ESTIMATED_UBUNTU_ISO_BYTES = 1_750_000_000;

/** xorriso warns if -volid has spaces / non-ECMA-119 characters; keep [A-Z0-9_]. */
const OUTPUT_ISO_VOLID = 'UBUNTU_24_HA_INSTALLER';

const execFileAsync = promisify(execFile);

/**
 * Ubuntu ISO layouts vary by release; files may not live under boot/grub/i386-pc/.
 * Prefer paths under .../boot/grub/ when multiple matches exist.
 */
function pickBestMatch(paths: string[]): string | null {
  if (paths.length === 0) return null;
  if (paths.length === 1) return paths[0];
  const underBootGrub = paths.filter((p) => p.includes(`${sep}boot${sep}grub${sep}`));
  return underBootGrub[0] ?? paths[0];
}

async function locateViaFind(isoTree: string, basename: string, iname: boolean): Promise<string | null> {
  try {
    const args = iname
      ? [isoTree, '-iname', basename, '-type', 'f']
      : [isoTree, '-name', basename, '-type', 'f'];
    const { stdout } = await execFileAsync('find', args, {
      maxBuffer: 32 * 1024 * 1024,
    });
    const lines = stdout
      .trim()
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    return pickBestMatch(lines);
  } catch (e) {
    logger.warn({ e, isoTree, basename, iname }, 'find failed while locating ISO boot file');
    return null;
  }
}

/** Pure Node fallback if `find` is missing or returns nothing (portable, no subprocess). */
async function walkFindFileByName(root: string, basename: string): Promise<string | null> {
  const want = basename.toLowerCase();
  async function walk(dir: string): Promise<string | null> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const ent of entries) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) {
        const sub = await walk(p);
        if (sub) return sub;
      } else if (ent.name.toLowerCase() === want) {
        return p;
      }
    }
    return null;
  }
  return walk(root);
}

async function locateFileInIsoTree(isoTree: string, basename: string): Promise<string | null> {
  let r = await locateViaFind(isoTree, basename, false);
  if (r) return r;
  r = await locateViaFind(isoTree, basename, true);
  if (r) return r;
  r = await walkFindFileByName(isoTree, basename);
  return r;
}

async function describeBootGrubHint(isoTree: string): Promise<string> {
  const parts: string[] = [];
  for (const rel of ['boot/grub', 'boot/grub/i386-pc', 'boot/grub/x86_64-efi']) {
    const p = join(isoTree, ...rel.split('/'));
    const names = await readdir(p).catch(() => [] as string[]);
    parts.push(`${rel}: ${names.slice(0, 40).join(', ') || '(missing)'}`);
  }
  return parts.join(' | ');
}

export type JobStatus = 'pending' | 'running' | 'complete' | 'failed' | 'cancelled';

/** Thrown when the user or server aborts an in-flight ISO build. */
export class BuildCancelledError extends Error {
  override readonly name = 'BuildCancelledError';
  constructor(message = 'Build cancelled') {
    super(message);
  }
}

export interface InstallerJobConfig {
  hostname: string;
  username: string;
  password: string;       // plaintext — hashed during build, never stored
  sshPublicKey?: string;
}

export interface ProgressEvent {
  percent: number;
  message: string;
  status: JobStatus;
}

export type ProgressCallback = (event: ProgressEvent) => void;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function progress(cb: ProgressCallback, percent: number, message: string, status: JobStatus = 'running'): void {
  logger.info({ percent, message }, 'ISO build progress');
  cb({ percent, message, status });
}

function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new BuildCancelledError();
}

/** Run a shell command and resolve when it exits successfully. */
function runCancellable(
  cmd: string,
  args: string[],
  options: {
    onStderr?: (line: string) => void;
    signal?: AbortSignal;
    /** When non-zero exit, append last N chars of stderr to the Error message (xorriso hides detail otherwise). */
    attachStderrTailOnError?: number;
  },
): Promise<void> {
  const { onStderr, signal, attachStderrTailOnError = 0 } = options;
  return new Promise((resolve, reject) => {
    throwIfCancelled(signal);
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderrAcc = '';
    const onAbort = (): void => {
      proc.kill('SIGTERM');
      setTimeout(() => {
        if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL');
      }, 5_000).unref?.();
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    proc.stdout?.on('data', () => { /* discard */ });
    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      if (attachStderrTailOnError > 0) {
        stderrAcc = (stderrAcc + text).slice(-Math.max(attachStderrTailOnError * 2, 24_000));
      }
      const line = text.trim();
      if (line && onStderr) {
        for (const part of text.split(/\r?\n/)) {
          const p = part.trim();
          if (p) onStderr(p);
        }
      }
    });
    proc.on('close', (code) => {
      signal?.removeEventListener('abort', onAbort);
      if (signal?.aborted) {
        reject(new BuildCancelledError());
        return;
      }
      if (code === 0) resolve();
      else {
        let msg = `${cmd} exited with code ${code}`;
        if (attachStderrTailOnError > 0 && stderrAcc.trim()) {
          const tail = stderrAcc.trim().slice(-attachStderrTailOnError);
          msg += `. stderr (last ${tail.length} chars): ${tail}`;
        }
        reject(new Error(msg));
      }
    });
    proc.on('error', (err) => {
      signal?.removeEventListener('abort', onAbort);
      if (signal?.aborted) reject(new BuildCancelledError());
      else reject(err);
    });
  });
}

/**
 * Full-tree `xorriso -extract /` often omits hybrid boot blobs; they still exist as ISO9660 paths
 * on the image. Pull them with single-file extract (same as Ubuntu remastering docs).
 */
async function extractIsoFileIfMissing(
  cachedIso: string,
  isoTree: string,
  isoPathCandidates: string[],
  destSegments: string[],
  signal: AbortSignal | undefined,
): Promise<boolean> {
  const destAbs = join(isoTree, ...destSegments);
  try {
    await stat(destAbs);
    return true;
  } catch {
    /* extract */
  }
  await mkdir(dirname(destAbs), { recursive: true });
  for (const isoPath of isoPathCandidates) {
    try {
      await runCancellable('xorriso', ['-osirrox', 'on', '-indev', cachedIso, '-extract', isoPath, destAbs], {
        signal,
      });
      await stat(destAbs);
      logger.info({ isoPath, destAbs }, 'Pulled file from Ubuntu ISO via single-file xorriso extract');
      return true;
    } catch (e) {
      logger.debug({ e, isoPath, destAbs }, 'single-file xorriso extract attempt failed');
    }
  }
  return false;
}

async function ensureBootHybridAndEfiFromIsoImage(
  cachedIso: string,
  isoTree: string,
  signal: AbortSignal | undefined,
): Promise<void> {
  await extractIsoFileIfMissing(
    cachedIso,
    isoTree,
    ['/boot/grub/i386-pc/boot_hybrid.img', 'boot/grub/i386-pc/boot_hybrid.img'],
    ['boot', 'grub', 'i386-pc', 'boot_hybrid.img'],
    signal,
  );
  await extractIsoFileIfMissing(
    cachedIso,
    isoTree,
    [
      '/boot/grub/efi.img',
      'boot/grub/efi.img',
      '/boot/grub/x86_64-efi/efi.img',
      'boot/grub/x86_64-efi/efi.img',
    ],
    ['boot', 'grub', 'efi.img'],
    signal,
  );
}

/** Spaces split tokens unless inside single quotes (xorriso mkisofs report lines). */
function tokenizeMkisofsReportLine(s: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === "'") {
      inQuote = !inQuote;
      cur += c;
      continue;
    }
    if (!inQuote && /\s/.test(c)) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function filterVolumeAndDateFromMkisofsTokens(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t === '-V') {
      i++;
      continue;
    }
    if (t.startsWith('--modification-date=')) continue;
    if (t === '--modification-date') {
      i++;
      continue;
    }
    out.push(t);
  }
  return out;
}

/** Report output must not include -o (we supply -o and the tree ourselves). */
function stripOutputSpecifierFromMkisofsTokens(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t === '-o') {
      i++;
      continue;
    }
    out.push(t);
  }
  return out;
}

/**
 * `xorriso -report_* as_mkisofs` prints shell-style quoting. We pass argv directly (no shell), so
 * literal `'` characters in tokens break parsing — see bin_path='/'"'"'/boot/... and interval open errors.
 */
function normalizeXorrisoMkisofsTokens(tokens: string[]): string[] {
  return tokens.map((raw) => {
    let t = raw.replace(/'"'"'/g, "'").replace(/\0/g, '');
    // Token was one shell-quoted span, e.g. '/boot/grub/...' — drop outer quotes only.
    if (t.length >= 2) {
      const a = t[0];
      const b = t[t.length - 1];
      if ((a === "'" && b === "'") || (a === '"' && b === '"')) {
        t = t.slice(1, -1);
      }
    }
    // --interval:...:'/abs/path'  →  --interval:...:/abs/path  (spawn has no shell)
    if (t.startsWith('--interval:')) {
      t = t.replace(/:'(\/[^']+)'$/g, ':$1');
    }
    return t;
  });
}

/**
 * Parse stdout/stderr from `xorriso -indev ISO -report_el_torito as_mkisofs`.
 * Rewrites any `'…something.iso'` interval reference to our cached Ubuntu image (absolute path).
 */
function parseXorrisoMkisofsReport(raw: string, cachedIsoAbs: string): string[] {
  const lines = raw.split('\n');
  const kept: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (/^xorriso\s*:/i.test(t)) continue;
    if (/^libisofs:/i.test(t)) continue;
    if (/^Drive current:/i.test(t)) continue;
    if (/^Media current:/i.test(t)) continue;
    if (/^Media status/i.test(t)) continue;
    if (/^Media summary/i.test(t)) continue;
    if (/^Boot record/i.test(t)) continue;
    if (/^Volume id/i.test(t)) continue;
    if (t.startsWith('-')) kept.push(t);
  }
  let joined = kept.join(' ');
  // Reference the cached ISO by path without shell quotes (normalizeXorrisoMkisofsTokens strips them).
  joined = joined.replace(/'[^']*\.iso'/gi, cachedIsoAbs);
  const tokens = tokenizeMkisofsReportLine(joined);
  return normalizeXorrisoMkisofsTokens(
    stripOutputSpecifierFromMkisofsTokens(filterVolumeAndDateFromMkisofsTokens(tokens)),
  );
}

function mkisofsRecipeLooksUsable(tokens: string[]): boolean {
  const joined = tokens.join(' ');
  if (/--grub2-mbr/.test(joined)) return true;
  if (/-isohybrid-mbr/.test(joined)) return true;
  if (tokens.includes('-b') && tokens.includes('-no-emul-boot')) return true;
  return false;
}

/**
 * Report lines may use `-e '--interval:appended_partition_2_start_NNNs_size_MMMd:all::'` from the
 * *stock* ISO. After we change the tree, those sector numbers can make xorriso abort (often exit 5).
 * The relative `appended_partition_2:::` form matches our manual legacy recipe and xorriso docs.
 */
function simplifyAppendedPartitionEfiInRecipe(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    const next = tokens[i + 1];
    if (t === '-e' && typeof next === 'string' && next.includes('appended_partition_2_start')) {
      out.push('-e', '--interval:appended_partition_2:::');
      i++;
      continue;
    }
    out.push(t);
  }
  return out;
}

async function gatherMkisofsBootRecipe(
  cachedIsoAbs: string,
  signal: AbortSignal | undefined,
): Promise<string[] | null> {
  const tryReport = async (mode: 'el_torito' | 'system_area'): Promise<string[] | null> => {
    const reportFlag = mode === 'el_torito' ? '-report_el_torito' : '-report_system_area';
    try {
      const { stdout, stderr } = await execFileAsync(
        'xorriso',
        [
          '-no_rc',
          '-abort_on', 'NEVER',
          '-report_about', 'SORRY',
          '-indev', cachedIsoAbs,
          reportFlag,
          'as_mkisofs',
        ],
        { maxBuffer: 16 * 1024 * 1024, signal },
      );
      const raw = `${stdout}\n${stderr}`;
      const tokens = parseXorrisoMkisofsReport(raw, cachedIsoAbs);
      return tokens.length > 0 ? tokens : null;
    } catch (e) {
      logger.warn({ e, cachedIsoAbs, mode }, 'xorriso boot recipe report failed');
      return null;
    }
  };

  const fromElTorito = await tryReport('el_torito');
  if (fromElTorito && mkisofsRecipeLooksUsable(fromElTorito)) return fromElTorito;

  const fromSysArea = await tryReport('system_area');
  if (fromSysArea && mkisofsRecipeLooksUsable(fromSysArea)) return fromSysArea;

  return fromElTorito ?? fromSysArea ?? null;
}

/**
 * Node started from the macOS GUI or some IDEs inherits a minimal PATH without Homebrew.
 * xorriso from `brew install` lives under /opt/homebrew (Apple Silicon) or /usr/local (Intel).
 */
function ensureHomebrewOnPath(): void {
  if (process.platform !== 'darwin') return;
  const existing = process.env.PATH ?? '';
  const segments = new Set(existing.split(':').filter(Boolean));
  const prepend: string[] = [];
  for (const dir of ['/opt/homebrew/bin', '/usr/local/bin']) {
    if (!segments.has(dir)) prepend.push(dir);
  }
  if (prepend.length === 0) return;
  process.env.PATH = [...prepend, existing].filter(Boolean).join(':');
}

/** Check that a required CLI tool is available in $PATH. */
async function requireTool(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    execFile('which', [name], (err) => {
      if (err) {
        if (name === 'xorriso') {
          reject(
            new Error(
              'Missing xorriso on the server (not in PATH). Install it on the host that runs the backend: ' +
                'macOS: brew install xorriso · Debian/Ubuntu: sudo apt install xorriso · Alpine/Docker image: apk add xorriso.',
            ),
          );
        } else {
          reject(new Error(`Missing required tool "${name}" on the server PATH.`));
        }
      } else resolve();
    });
  });
}

/** Download a URL to destPath, reporting progress. Returns SHA-256 of the file. */
async function downloadFile(
  url: string,
  destPath: string,
  onProgress: (downloaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  throwIfCancelled(signal);
  const get = url.startsWith('https') ? httpsGet : httpGet;
  const hash = createHash('sha256');

  return new Promise((resolve, reject) => {
    let req: ClientRequest | undefined;
    let out: ReturnType<typeof createWriteStream> | undefined;
    let resStream: IncomingMessage | undefined;
    let settled = false;

    const cleanup = (): void => {
      try { resStream?.destroy(); } catch { /* ignore */ }
      try { out?.destroy(); } catch { /* ignore */ }
      try { req?.destroy(); } catch { /* ignore */ }
    };

    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      fn();
    };

    const fail = (err: Error): void => {
      settle(() => {
        cleanup();
        reject(err);
      });
    };

    const onAbort = (): void => {
      settle(() => {
        cleanup();
        reject(new BuildCancelledError());
      });
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    req = get(url, (res) => {
      resStream = res;
      // Follow redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        const location = res.headers.location;
        if (!location) return fail(new Error('Redirect with no Location header'));
        signal?.removeEventListener('abort', onAbort);
        return downloadFile(location, destPath, onProgress, signal).then(
          (v) => settle(() => resolve(v)),
          (e) => settle(() => reject(e)),
        );
      }
      if (res.statusCode !== 200) {
        return fail(new Error(`HTTP ${res.statusCode} downloading ${url}`));
      }

      const total = parseInt(res.headers['content-length'] ?? '0', 10);
      let downloaded = 0;
      out = createWriteStream(destPath);

      res.on('data', (chunk: Buffer) => {
        downloaded += chunk.length;
        hash.update(chunk);
        onProgress(downloaded, total);
      });
      res.pipe(out);
      out.on('finish', () => {
        signal?.removeEventListener('abort', onAbort);
        settle(() => resolve(hash.digest('hex')));
      });
      out.on('error', (err) => fail(err));
      res.on('error', (err) => fail(err));
    });
    req.on('error', (err) => {
      signal?.removeEventListener('abort', onAbort);
      settle(() => {
        if (signal?.aborted) reject(new BuildCancelledError());
        else reject(err);
      });
    });
  });
}

/** Check existing file SHA-256 without loading it all into memory. */
async function fileSha256(
  path: string,
  options?: { signal?: AbortSignal; onProgress?: (read: number, total: number) => void },
): Promise<string> {
  const { createReadStream } = await import('node:fs');
  const st = await stat(path);
  const total = st.size;
  const hash = createHash('sha256');
  let read = 0;
  let lastReportedPct = -1;

  return new Promise((resolve, reject) => {
    const stream = createReadStream(path);
    const onAbort = (): void => {
      stream.destroy();
      reject(new BuildCancelledError());
    };
    options?.signal?.addEventListener('abort', onAbort, { once: true });

    stream.on('data', (chunk: string | Buffer) => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      read += buf.length;
      hash.update(buf);
      if (options?.onProgress && total > 0) {
        const pct = Math.floor((read / total) * 100);
        if (pct > lastReportedPct) {
          lastReportedPct = pct;
          options.onProgress(read, total);
        }
      }
    });
    stream.on('end', () => {
      options?.signal?.removeEventListener('abort', onAbort);
      resolve(hash.digest('hex'));
    });
    stream.on('error', (err) => {
      options?.signal?.removeEventListener('abort', onAbort);
      reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

export interface BuildInstallerIsoOptions {
  /** When aborted, stops download and terminates xorriso child processes. */
  signal?: AbortSignal;
}

export async function buildInstallerIso(
  jobId: string,
  config: InstallerJobConfig,
  onProgress: ProgressCallback,
  options?: BuildInstallerIsoOptions,
): Promise<string> {
  const signal = options?.signal;
  const { isoCacheDir, workDir, ubuntuIsoUrl, ubuntuIsoSha256, appRepoUrl, envFilePath } = appConfig.serverInstaller;

  try {
  // Validate required config
  if (!appRepoUrl) {
    throw new Error('APP_REPO_URL is not configured. Set it in your .env file.');
  }

  ensureHomebrewOnPath();
  await requireTool('xorriso');

  const jobWorkDir = join(workDir, jobId);
  const isoTree = join(jobWorkDir, 'iso-tree');
  const outputIso = join(jobWorkDir, 'output.iso');
  const cachedIso = join(isoCacheDir, 'ubuntu-24.04.2-live-server-amd64.iso');

  await mkdir(jobWorkDir, { recursive: true });
  await mkdir(isoCacheDir, { recursive: true });
  throwIfCancelled(signal);

  // -------------------------------------------------------------------------
  // Step 1: Ensure base Ubuntu ISO is cached (0–30%)
  // -------------------------------------------------------------------------
  progress(onProgress, 2, 'Checking for cached Ubuntu ISO...');

  let needsDownload = true;
  try {
    await stat(cachedIso);
    progress(onProgress, 5, 'Found cached ISO, verifying SHA-256...');
    throwIfCancelled(signal);
    let lastVerifyPct = 5;
    const existingHash = await fileSha256(cachedIso, {
      signal,
      onProgress: (read, total) => {
        const pct = 5 + Math.min(24, Math.floor((read / total) * 24));
        if (pct > lastVerifyPct) {
          lastVerifyPct = pct;
          const mb = Math.floor(read / 1_048_576);
          const totalMb = Math.floor(total / 1_048_576);
          progress(onProgress, pct, `Verifying cached ISO... ${mb} / ${totalMb} MB`);
        }
      },
    });
    if (existingHash === ubuntuIsoSha256) {
      progress(onProgress, 30, 'Cached ISO verified.');
      needsDownload = false;
    } else {
      logger.warn({ existingHash, expected: ubuntuIsoSha256 }, 'Cached ISO SHA-256 mismatch, re-downloading');
    }
  } catch {
    // File doesn't exist yet
  }

  if (needsDownload) {
    progress(onProgress, 5, 'Downloading Ubuntu 24.04 Server ISO (1.6 GB)...');
    const tmpDest = cachedIso + '.tmp';

    let lastReportedPct = 5;
    const actualHash = await downloadFile(ubuntuIsoUrl, tmpDest, (downloaded, total) => {
      const denom = total > 0 ? total : ESTIMATED_UBUNTU_ISO_BYTES;
      const rawPct = 5 + Math.floor((downloaded / denom) * 23);
      const pct = Math.min(rawPct, 28);
      if (pct > lastReportedPct) {
        lastReportedPct = pct;
        const mb = Math.floor(downloaded / 1_048_576);
        const totalMb = Math.floor(denom / 1_048_576);
        const detail =
          total > 0
            ? `Downloading Ubuntu ISO... ${mb} / ${totalMb} MB`
            : `Downloading Ubuntu ISO... ${mb} MB (~${totalMb} MB expected)`;
        progress(onProgress, pct, detail);
      }
    }, signal);

    progress(onProgress, 29, 'Verifying download SHA-256...');
    if (actualHash !== ubuntuIsoSha256) {
      await rm(tmpDest, { force: true });
      throw new Error(
        `SHA-256 mismatch for Ubuntu ISO (corrupt download or mirror file changed). ` +
          `Check ${ubuntuIsoUrl.replace(/[^/]+$/, 'SHA256SUMS')} and set UBUNTU_ISO_SHA256, or clear the ISO cache. ` +
          `Expected: ${ubuntuIsoSha256}, got: ${actualHash}`,
      );
    }

    await rename(tmpDest, cachedIso);
    progress(onProgress, 30, 'ISO downloaded and verified.');
  }

  // -------------------------------------------------------------------------
  // Step 2: Extract ISO (30–50%)
  // -------------------------------------------------------------------------
  progress(onProgress, 31, 'Extracting ISO contents...');
  await mkdir(isoTree, { recursive: true });
  throwIfCancelled(signal);

  await runCancellable('xorriso', [
    '-osirrox', 'on',
    '-indev', cachedIso,
    '-extract', '/', isoTree,
  ], { onStderr: (line) => logger.debug({ line }, 'xorriso extract'), signal });

  progress(onProgress, 50, 'ISO extracted.');

  // -------------------------------------------------------------------------
  // Step 3: Inject autoinstall config (50–56%)
  // -------------------------------------------------------------------------
  progress(onProgress, 51, 'Generating autoinstall configuration...');

  // Read and base64-encode the .env file
  let envContent: string;
  try {
    envContent = await readFile(envFilePath, 'utf8');
  } catch {
    throw new Error(`Could not read .env file at ${envFilePath}`);
  }
  const envFileBase64 = Buffer.from(envContent).toString('base64');

  const hashedPassword = hashPasswordForAutoinstall(config.password);

  const userDataYaml = generateAutoinstallYaml({
    hostname: config.hostname,
    username: config.username,
    hashedPassword,
    sshAuthorizedKey: config.sshPublicKey,
    appRepoUrl,
    envFileBase64,
    appDir: '/opt/home-automation',
  });

  await writeFile(join(isoTree, 'user-data'), userDataYaml, 'utf8');
  await writeFile(join(isoTree, 'meta-data'), '', 'utf8');

  progress(onProgress, 53, 'Injecting autoinstall files...');

  // Patch boot/grub/grub.cfg — add autoinstall kernel params
  const grubPaths = [
    join(isoTree, 'boot', 'grub', 'grub.cfg'),
    join(isoTree, 'boot', 'grub', 'grub.cfg.bak'), // not always present, skip
  ];

  for (const grubPath of grubPaths) {
    try {
      const original = await readFile(grubPath, 'utf8');
      const AUTOINSTALL_PARAMS = 'autoinstall ds=nocloud\\;s=/cdrom/';
      const patched = original.replace(
        /(linux\s+\/casper\/vmlinuz\b[^\n]*)/g,
        `$1 ${AUTOINSTALL_PARAMS}`,
      );
      if (patched !== original) {
        await writeFile(grubPath, patched, 'utf8');
        logger.info({ grubPath }, 'Patched grub.cfg');
      }
    } catch {
      // File may not exist on all ISO layouts
    }
  }

  progress(onProgress, 55, 'Boot configuration patched.');

  // -------------------------------------------------------------------------
  // Step 4–5: Repack ISO with BIOS + UEFI hybrid boot (56–90%)
  // -------------------------------------------------------------------------
  // Ubuntu 24.04+ often do not expose boot_hybrid.img / efi.img as normal files in the ISO
  // tree — EFI is often an appended partition only. xorriso can reproduce boot equipment
  // from the upstream ISO via --interval:local_fs:…:’original.iso’ (see GNU xorriso docs).
  const cachedIsoAbs = await realpath(cachedIso).catch(() => resolve(cachedIso));

  progress(onProgress, 56, 'Reading boot layout from Ubuntu ISO (El Torito / system area)...');
  const recipe = await gatherMkisofsBootRecipe(cachedIsoAbs, signal);

  progress(onProgress, 57, 'Repacking bootable ISO (this may take a minute)...');
  throwIfCancelled(signal);

  const onXorrisoMkisofsStderr = (line: string): void => {
    const match = line.match(/(\d+)\s*%/);
    if (match) {
      const xorPct = parseInt(match[1], 10);
      const overallPct = 57 + Math.floor((xorPct / 100) * 33); // 57–90%
      progress(onProgress, overallPct, 'Repacking bootable ISO...');
    }
  };

  if (recipe && mkisofsRecipeLooksUsable(recipe)) {
    const mkisofsFromRecipe = (r: string[]): string[] => [
      '-no_rc',
      '-abort_on', 'NEVER',
      '-as', 'mkisofs',
      '-r',
      '-V', OUTPUT_ISO_VOLID,
      ...r,
      '-o', outputIso,
      isoTree,
    ];
    try {
      await runCancellable('xorriso', mkisofsFromRecipe(recipe), {
        onStderr: onXorrisoMkisofsStderr,
        signal,
        attachStderrTailOnError: 6000,
      });
    } catch (firstErr) {
      const simplified = simplifyAppendedPartitionEfiInRecipe(recipe);
      if (JSON.stringify(simplified) === JSON.stringify(recipe)) throw firstErr;
      logger.warn(
        { jobId },
        'xorriso mkisofs failed with stock -e interval; retrying with appended_partition_2:::',
      );
      await runCancellable('xorriso', mkisofsFromRecipe(simplified), {
        onStderr: onXorrisoMkisofsStderr,
        signal,
        attachStderrTailOnError: 6000,
      });
    }
  } else {
    logger.warn(
      { cachedIsoAbs },
      'Falling back to file-based mkisofs (could not parse -report_el_torito as_mkisofs); ' +
        'ensure upstream ISO matches Ubuntu live-server layout.',
    );
    progress(onProgress, 56, 'Ensuring hybrid boot blobs (full extract often skips these)...');
    await ensureBootHybridAndEfiFromIsoImage(cachedIso, isoTree, signal);

    progress(onProgress, 56, 'Locating boot images (boot_hybrid.img, efi.img)...');
    const bootHybridImg = await locateFileInIsoTree(isoTree, 'boot_hybrid.img');
    const efiImg = await locateFileInIsoTree(isoTree, 'efi.img');

    if (!bootHybridImg || !efiImg) {
      const hint = await describeBootGrubHint(isoTree);
      throw new Error(
        `Could not find boot_hybrid.img and efi.img in the extracted Ubuntu ISO. ${hint} ` +
          `If this persists, the ISO layout may differ from what the installer expects.`,
      );
    }

    await runCancellable(
      'xorriso',
      [
        '-no_rc',
        '-abort_on', 'NEVER',
        '-as', 'mkisofs',
        '-r',
        '-V', OUTPUT_ISO_VOLID,
        '--grub2-mbr', bootHybridImg,
        '--protective-msdos-label',
        '-partition_offset', '16',
        '--mbr-force-bootable',
        '-append_partition', '2', '28732ac11ff8d211ba4b00a0c93ec93b', efiImg,
        '-appended_part_as_gpt',
        '-iso_mbr_part_type', 'a2a0d0ebe5b9334487c068b6b72699c7',
        '-c', '/boot/boot.catalog',
        '-b', '/boot/grub/i386-pc/eltorito.img',
        '-no-emul-boot',
        '-boot-load-size', '4',
        '-boot-info-table',
        '--grub2-boot-info',
        '-eltorito-alt-boot',
        '-e', '--interval:appended_partition_2:::',
        '-no-emul-boot',
        '-boot-load-size', '7336',
        '-o', outputIso,
        isoTree,
      ],
      { onStderr: onXorrisoMkisofsStderr, signal, attachStderrTailOnError: 6000 },
    );
  }

  // -------------------------------------------------------------------------
  // Step 6: Finalize (90–100%)
  // -------------------------------------------------------------------------
  progress(onProgress, 90, 'Cleaning up build directory...');
  await chmodTreeWritable(isoTree);
  await rm(isoTree, { recursive: true, force: true });

  progress(onProgress, 100, 'ISO ready for download', 'complete');
  logger.info({ jobId, outputIso }, 'Installer ISO build complete');

  return outputIso;
  } catch (err) {
    if (err instanceof BuildCancelledError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    try {
      progress(onProgress, 0, msg, 'failed');
    } catch {
      /* ignore */
    }
    throw err;
  }
}
