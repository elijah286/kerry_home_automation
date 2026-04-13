-- At most one installer ISO build may be in "running" state at a time (singleton job).
CREATE UNIQUE INDEX IF NOT EXISTS installer_jobs_single_running
  ON installer_jobs ((true))
  WHERE status = 'running';
