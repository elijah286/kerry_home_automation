// ---------------------------------------------------------------------------
// Git trust for mounted host checkout (uid ≠ container uid; Git 2.35+ blocks otherwise).
// We write ~/.gitconfig-style content with fs (no `git` subprocess — cannot fail silently).
// GIT_CONFIG_GLOBAL points every repo operation at that file.
//
// Use /app (not /tmp): some hosts restrict /tmp; /app is always writable in Dockerfile.prod.
// ---------------------------------------------------------------------------

import { writeFileSync } from 'node:fs';

/** Under /app so it survives typical tmp policies and matches the image layout. */
export const GIT_GLOBAL_CONFIG_FILE = '/app/ha-git-global.gitconfig';

function deployRoot(): string {
  return (process.env.HA_APP_ROOT ?? '/opt/home-automation').replace(/\/$/, '');
}

/** Idempotent; safe to call on every execGit / startup. */
export function ensureGitSafeGlobalConfig(): void {
  const root = deployRoot();
  // Git config format: tab before key (same as `git config --file` output).
  const contents = `[safe]
\tdirectory = *
\tdirectory = ${root}
`;
  try {
    writeFileSync(GIT_GLOBAL_CONFIG_FILE, contents, { encoding: 'utf8', mode: 0o644 });
  } catch (e) {
    console.error('[git-env] failed to write', GIT_GLOBAL_CONFIG_FILE, e);
  }
}

// Run as soon as this module loads (imports run before main()), so the file exists before any route.
ensureGitSafeGlobalConfig();

/** Env for every `git` child: trust file + ignore system gitconfig surprises + stable HOME. */
export function gitProcessEnv(): NodeJS.ProcessEnv {
  const base = { ...process.env };
  delete base.GIT_CONFIG_GLOBAL;
  delete base.GIT_CONFIG_SYSTEM;
  return {
    ...base,
    HOME: '/root',
    GIT_CONFIG_GLOBAL: GIT_GLOBAL_CONFIG_FILE,
    GIT_CONFIG_NOSYSTEM: '1',
  };
}
