-- Per-device settings (history retention override, etc.)
CREATE TABLE IF NOT EXISTS device_settings (
  device_id TEXT PRIMARY KEY,
  history_retention_days INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
