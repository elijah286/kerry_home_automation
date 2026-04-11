CREATE TABLE integration_entries (
  id TEXT PRIMARY KEY,
  integration TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  config JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_integration_entries_integration ON integration_entries(integration);
