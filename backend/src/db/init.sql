-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Floors
CREATE TABLE IF NOT EXISTS floors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  level INTEGER
);

-- Areas (rooms/zones)
CREATE TABLE IF NOT EXISTS areas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  floor_id TEXT REFERENCES floors(id),
  icon TEXT
);

-- Devices  
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  manufacturer TEXT,
  model TEXT,
  area_id TEXT REFERENCES areas(id),
  protocol TEXT NOT NULL,
  connection JSONB NOT NULL DEFAULT '{}',
  disabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Entities
CREATE TABLE IF NOT EXISTS entities (
  entity_id TEXT PRIMARY KEY,
  device_id TEXT REFERENCES devices(id),
  domain TEXT NOT NULL,
  platform TEXT NOT NULL,
  name TEXT,
  area_id TEXT REFERENCES areas(id),
  disabled BOOLEAN NOT NULL DEFAULT false,
  icon TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- State history (partitioned by day for efficient purging)
CREATE TABLE IF NOT EXISTS state_history (
  id BIGSERIAL,
  entity_id TEXT NOT NULL,
  state TEXT NOT NULL,
  attributes JSONB,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

-- Create partitions for the next 30 days (a cron job will create future ones)
DO $$
DECLARE
  start_date DATE := CURRENT_DATE;
  end_date DATE;
  partition_name TEXT;
BEGIN
  FOR i IN 0..30 LOOP
    end_date := start_date + INTERVAL '1 day';
    partition_name := 'state_history_' || TO_CHAR(start_date, 'YYYY_MM_DD');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF state_history FOR VALUES FROM (%L) TO (%L)',
      partition_name, start_date, end_date
    );
    start_date := end_date;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_state_history_entity_time ON state_history (entity_id, timestamp DESC);

-- Automation rules
CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  trigger_config JSONB NOT NULL,
  condition_config JSONB,
  action_config JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Automation execution log
CREATE TABLE IF NOT EXISTS automation_log (
  id BIGSERIAL PRIMARY KEY,
  automation_id TEXT REFERENCES automations(id),
  triggered_by TEXT,
  success BOOLEAN NOT NULL,
  error TEXT,
  duration_ms INTEGER,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_log_time ON automation_log (timestamp DESC);

-- Per-area lighting automation configuration
CREATE TABLE IF NOT EXISTS area_lighting_config (
  area_id TEXT PRIMARY KEY REFERENCES areas(id),
  target_lux INTEGER NOT NULL DEFAULT 150,
  illuminance_entity_id TEXT,
  activation_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.55,
  deactivation_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.40,
  min_hold_seconds INTEGER NOT NULL DEFAULT 300,
  weight_overrides JSONB,
  enabled BOOLEAN NOT NULL DEFAULT true
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('admin', 'member', 'guest')),
  allowed_areas TEXT[] DEFAULT NULL,
  dashboard_config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Kiosk tokens for wall-mounted tablets
CREATE TABLE IF NOT EXISTS kiosk_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  area_ids TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

-- Purge old data function
CREATE OR REPLACE FUNCTION purge_old_partitions(retention_days INTEGER DEFAULT 30) RETURNS void AS $$
DECLARE
  cutoff DATE := CURRENT_DATE - retention_days;
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT tablename FROM pg_tables 
    WHERE tablename LIKE 'state_history_%' 
    AND tablename < 'state_history_' || TO_CHAR(cutoff, 'YYYY_MM_DD')
  LOOP
    EXECUTE 'DROP TABLE IF EXISTS ' || rec.tablename;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
