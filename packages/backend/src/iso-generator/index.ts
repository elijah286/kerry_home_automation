// ---------------------------------------------------------------------------
// Server installer ISO build pipeline
// ---------------------------------------------------------------------------

import { mkdir, writeFile, readFile, rm, rename, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { join } from 'node:path';
import { createWriteStream } from 'node:fs';
import { get as httpsGet } from 'node:https';
import { get as httpGet } from 'node:http';
import { appConfig } from '../config.js';
import { generateAutoinstallYaml, hashPasswordForAutoinstall } from './autoinstall.js';
import { logger } from '../logger.js';

export type JobStatus = 'pending' | 'running' | 'complete' | 'failed';

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

/** Run a shell command and resolve when it exits successfully. */
function run(cmd: string, args: string[], onStderr?: (line: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout?.on('data', () => { /* discard */ });
    proc.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString().trim();
      if (line && onStderr) onStderr(line);
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}

/** Check that a required CLI tool is available in $PATH. */
async function requireTool(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    execFile('which', [name], (err) => {
      if (err) reject(new Error(`Required tool '${name}' not found in $PATH. Install it with: apt install ${name}`));
      else resolve();
    });
  });
}

/** Download a URL to destPath, reporting progress. Returns SHA-256 of the file. */
async function downloadFile(
  url: string,
  destPath: string,
  onProgress: (downloaded: number, total: number) => void,
): Promise<string> {
  const get = url.startsWith('https') ? httpsGet : httpGet;
  const hash = createHash('sha256');

  return new Promise((resolve, reject) => {
    get(url, (res) => {
      // Follow redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        const location = res.headers.location;
        if (!location) return reject(new Error('Redirect with no Location header'));
        return downloadFile(location, destPath, onProgress).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
      }

      const total = parseInt(res.headers['content-length'] ?? '0', 10);
      let downloaded = 0;
      const out = createWriteStream(destPath);

      res.on('data', (chunk: Buffer) => {
        downloaded += chunk.length;
        hash.update(chunk);
        onProgress(downloaded, total);
      });
      res.pipe(out);
      out.on('finish', () => resolve(hash.digest('hex')));
      out.on('error', reject);
      res.on('error', reject);
    }).on('error', reject);
  });
}

/** Check existing file SHA-256 without loading it all into memory. */
async function fileSha256(path: string): Promise<string> {
  const { createReadStream } = await import('node:fs');
  const hash = createHash('sha256');
  return new Promise((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

export async function buildInstallerIso(
  jobId: string,
  config: InstallerJobConfig,
  onProgress: ProgressCallback,
): Promise<string> {
  const { isoCacheDir, workDir, ubuntuIsoUrl, ubuntuIsoSha256, appRepoUrl, envFilePath } = appConfig.serverInstaller;

  // Validate required config
  if (!appRepoUrl) {
    throw new Error('APP_REPO_URL is not configured. Set it in your .env file.');
  }

  await requireTool('xorriso');

  const jobWorkDir = join(workDir, jobId);
  const isoTree = join(jobWorkDir, 'iso-tree');
  const outputIso = join(jobWorkDir, 'output.iso');
  const cachedIso = join(isoCacheDir, 'ubuntu-24.04.2-live-server-amd64.iso');

  await mkdir(jobWorkDir, { recursive: true });
  await mkdir(isoCacheDir, { recursive: true });

  // -------------------------------------------------------------------------
  // Step 1: Ensure base Ubuntu ISO is cached (0–30%)
  // -------------------------------------------------------------------------
  progress(onProgress, 2, 'Checking for cached Ubuntu ISO...');

  let needsDownload = true;
  try {
    await stat(cachedIso);
    progress(onProgress, 5, 'Found cached ISO, verifying SHA-256...');
    const existingHash = await fileSha256(cachedIso);
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
      if (total > 0) {
        const pct = 5 + Math.floor((downloaded / total) * 23); // 5–28%
        if (pct > lastReportedPct) {
          lastReportedPct = pct;
          const mb = Math.floor(downloaded / 1_048_576);
          const totalMb = Math.floor(total / 1_048_576);
          progress(onProgress, pct, `Downloading Ubuntu ISO... ${mb} / ${totalMb} MB`);
        }
      }
    });

    progress(onProgress, 29, 'Verifying download SHA-256...');
    if (actualHash !== ubuntuIsoSha256) {
      await rm(tmpDest, { force: true });
      throw new Error(`SHA-256 mismatch — download may be corrupted. Expected: ${ubuntuIsoSha256}, got: ${actualHash}`);
    }

    await rename(tmpDest, cachedIso);
    progress(onProgress, 30, 'ISO downloaded and verified.');
  }

  // -------------------------------------------------------------------------
  // Step 2: Extract ISO (30–50%)
  // -------------------------------------------------------------------------
  progress(onProgress, 31, 'Extracting ISO contents...');
  await mkdir(isoTree, { recursive: true });

  await run('xorriso', [
    '-osirrox', 'on',
    '-indev', cachedIso,
    '-extract', '/', isoTree,
  ], (line) => logger.debug({ line }, 'xorriso extract'));

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

  progress(onProgress, 56, 'Boot configuration patched.');

  // -------------------------------------------------------------------------
  // Step 4: Locate xorriso boot artifacts from extracted tree
  // -------------------------------------------------------------------------
  const bootHybridImg = join(isoTree, 'boot', 'grub', 'i386-pc', 'boot_hybrid.img');
  const efiImg = join(isoTree, 'boot', 'grub', 'efi.img');

  // Validate both files exist before attempting repack
  try {
    await stat(bootHybridImg);
    await stat(efiImg);
  } catch (e) {
    throw new Error(
      `Could not find Ubuntu boot artifacts in extracted ISO. ` +
      `Expected: ${bootHybridImg} and ${efiImg}. ` +
      `The ISO layout may have changed — check boot/grub/ contents.`
    );
  }

  // -------------------------------------------------------------------------
  // Step 5: Repack ISO with BIOS + UEFI hybrid boot (56–90%)
  // -------------------------------------------------------------------------
  progress(onProgress, 57, 'Repacking bootable ISO (this may take a minute)...');

  await run('xorriso', [
    '-as', 'mkisofs',
    '-r',
    '-V', 'Ubuntu 24.04 HA Installer',
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
    isoTree,
    '-o', outputIso,
  ], (line) => {
    // xorriso prints progress lines — parse % from them
    const match = line.match(/(\d+)\s*%/);
    if (match) {
      const xorPct = parseInt(match[1], 10);
      const overallPct = 57 + Math.floor((xorPct / 100) * 33); // 57–90%
      progress(onProgress, overallPct, 'Repacking bootable ISO...');
    }
  });

  // -------------------------------------------------------------------------
  // Step 6: Finalize (90–100%)
  // -------------------------------------------------------------------------
  progress(onProgress, 90, 'Cleaning up build directory...');
  await rm(isoTree, { recursive: true, force: true });

  progress(onProgress, 100, 'ISO ready for download', 'complete');
  logger.info({ jobId, outputIso }, 'Installer ISO build complete');

  return outputIso;
}
