// ---------------------------------------------------------------------------
// Env for `git` child processes used by /api/system/update/*.
//
// Do NOT set GIT_CONFIG_GLOBAL unless that file exists. If GIT_CONFIG_GLOBAL points at a
// missing path, Git ignores the default global file ($HOME/.gitconfig), which is where
// Dockerfile.prod bakes `safe.directory=*` for root.
//
// We still pass `-c safe.directory=*` and `-c safe.directory=<repo>` on every git argv.
// ---------------------------------------------------------------------------

export function gitProcessEnv(): NodeJS.ProcessEnv {
  const base = { ...process.env };
  delete base.GIT_CONFIG_GLOBAL;
  delete base.GIT_CONFIG_SYSTEM;
  return {
    ...base,
    HOME: '/root',
    GIT_CONFIG_NOSYSTEM: '1',
  };
}
