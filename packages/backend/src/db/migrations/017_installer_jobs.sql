CREATE TABLE IF NOT EXISTS installer_jobs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status      TEXT NOT NULL DEFAULT 'pending',
  progress    INTEGER NOT NULL DEFAULT 0,
  message     TEXT NOT NULL DEFAULT '',
  iso_path    TEXT,
  created_by  UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mark any jobs that were in-flight when the server last shut down as failed
UPDATE installer_jobs
SET status = 'failed', message = 'Server restarted during build', updated_at = NOW()
WHERE status IN ('pending', 'running');
