-- System-wide settings (key-value)
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default history retention
INSERT INTO system_settings (key, value)
VALUES ('history_retention_days', '3')
ON CONFLICT (key) DO NOTHING;
