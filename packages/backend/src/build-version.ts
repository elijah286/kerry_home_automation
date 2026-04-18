// ---------------------------------------------------------------------------
// Build-time version baked into this container image
//
// Primary: /app/build-info.json (written by Dockerfile.prod from CI build args).
// Fallback: OCI labels on the running container (same metadata CI pushes via
// docker/build-push-action). This avoids false "pre-CI" detection when the JSON
// file is missing but the hub is still running ghcr.io images.
// Optional: HA_CONTAINER_VERSION / HA_CONTAINER_SHA for hosts where inspect
// is unavailable.
// ---------------------------------------------------------------------------

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

export interface BuildInfo {
  /** Semantic version tag, e.g. "v3.14.33". Empty string if unknown. */
  version: string;
  /** Full git SHA the image was built from. Empty string if unknown. */
  sha: string;
}

function normalizeVersion(v: string): string {
  const t = v.trim();
  return t && t !== 'dev' ? t : '';
}

function normalizeSha(s: string): string {
  const t = s.trim();
  return t && t !== 'unknown' ? t : '';
}

function readBuildInfoFile(): BuildInfo {
  try {
    const raw = readFileSync('/app/build-info.json', 'utf8');
    const parsed = JSON.parse(raw) as { version?: string; sha?: string };
    const version = normalizeVersion(parsed.version ?? '');
    const sha = normalizeSha(parsed.sha ?? '');
    if (version) return { version, sha };
  } catch {
    // missing or invalid
  }
  return { version: '', sha: '' };
}

function readBuildInfoEnv(): BuildInfo {
  const version = normalizeVersion(process.env.HA_CONTAINER_VERSION ?? '');
  const sha = normalizeSha(process.env.HA_CONTAINER_SHA ?? '');
  if (version) return { version, sha };
  return { version: '', sha: '' };
}

/**
 * Parse the image tag from HA_BACKEND_IMAGE (set in .env, pinned during install).
 * Example: "ghcr.io/elijah286/ha-backend:v3.55.0" → { version: "v3.55.0", sha: "" }
 * This reflects what docker compose actually launched — the definitive "what's deployed"
 * signal when the container image itself predates build-info.json.
 */
function readBuildInfoFromPinnedImage(): BuildInfo {
  const img = (process.env.HA_BACKEND_IMAGE ?? '').trim();
  if (!img) return { version: '', sha: '' };
  const tag = img.split(':').pop() ?? '';
  const version = normalizeVersion(tag);
  // Ignore sliding tags that don't reflect a real version
  if (!version || version === 'latest' || version === 'main') return { version: '', sha: '' };
  return { version, sha: '' };
}

/**
 * Read OCI labels from the running container (hostname is the container ID in Docker).
 * Only runs inside a container with the Docker CLI + socket (production backend image).
 */
function readBuildInfoDocker(): BuildInfo {
  if (!existsSync('/.dockerenv')) return { version: '', sha: '' };
  const hostname = process.env.HOSTNAME?.trim();
  if (!hostname) return { version: '', sha: '' };
  try {
    const out = execFileSync('docker', ['inspect', '-f', '{{json .Config.Labels}}', hostname], {
      encoding: 'utf8',
      timeout: 4000,
      windowsHide: true,
    });
    const labels = JSON.parse(out.trim()) as Record<string, string>;
    const version = normalizeVersion(labels['org.opencontainers.image.version'] ?? '');
    const sha = normalizeSha(labels['org.opencontainers.image.revision'] ?? '');
    if (version) return { version, sha };
  } catch {
    // no docker / inspect failed / wrong hostname
  }
  return { version: '', sha: '' };
}

/** Prefer earlier sources for each field; later sources only fill gaps. */
function mergeBuildInfo(...parts: BuildInfo[]): BuildInfo {
  let version = '';
  let sha = '';
  for (const p of parts) {
    if (!version && p.version) version = p.version;
    if (!sha && p.sha) sha = p.sha;
  }
  return { version, sha };
}

function loadBuildInfo(): BuildInfo {
  return mergeBuildInfo(
    readBuildInfoFile(),         // /app/build-info.json — most reliable
    readBuildInfoDocker(),       // OCI labels on running container
    readBuildInfoEnv(),          // HA_CONTAINER_VERSION override
    readBuildInfoFromPinnedImage(), // HA_BACKEND_IMAGE tag — what .env pinned
  );
}

export const buildInfo = loadBuildInfo();
