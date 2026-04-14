-- Per-integration verbose logging flags (system terminal / troubleshooting)
CREATE TABLE IF NOT EXISTS integration_debug_logging (
  integration_id TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
