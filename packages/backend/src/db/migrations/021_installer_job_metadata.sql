-- Metadata for listing completed installer ISOs (hostname label, size, completion time).
ALTER TABLE installer_jobs
  ADD COLUMN IF NOT EXISTS installer_hostname TEXT,
  ADD COLUMN IF NOT EXISTS installer_admin_username TEXT,
  ADD COLUMN IF NOT EXISTS iso_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS installer_jobs_completed_list_idx
  ON installer_jobs (updated_at DESC)
  WHERE status = 'complete';
