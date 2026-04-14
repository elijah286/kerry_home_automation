// ---------------------------------------------------------------------------
// Build-time version baked into this container image
//
// The Dockerfile creates /app/build-info.json with the version tag and git SHA
// passed as build args. Reading this at startup gives the *actual* running
// version rather than whatever the mounted git checkout happens to say.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export interface BuildInfo {
  /** Semantic version tag, e.g. "v3.14.33". Empty string if unknown. */
  version: string;
  /** Full git SHA the image was built from. Empty string if unknown. */
  sha: string;
}

function loadBuildInfo(): BuildInfo {
  // /app/build-info.json is created by the backend Dockerfile.prod:
  //   RUN printf '{"version":"%s","sha":"%s"}\n' "${BUILD_VERSION}" "${BUILD_SHA}" > /app/build-info.json
  try {
    const raw = readFileSync('/app/build-info.json', 'utf8');
    const parsed = JSON.parse(raw) as { version?: string; sha?: string };
    const version = (parsed.version ?? '').trim();
    const sha = (parsed.sha ?? '').trim();
    // "dev" / "unknown" are the Dockerfile defaults when no build args are passed (local source builds)
    if (version && version !== 'dev') {
      return { version, sha: sha !== 'unknown' ? sha : '' };
    }
  } catch {
    // build-info.json doesn't exist — container predates the CI/CD pipeline
  }

  return { version: '', sha: '' };
}

export const buildInfo = loadBuildInfo();
