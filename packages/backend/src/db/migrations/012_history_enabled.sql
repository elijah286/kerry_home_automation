-- Add history_enabled flag to device_settings (default true = record history)
ALTER TABLE device_settings ADD COLUMN IF NOT EXISTS history_enabled BOOLEAN NOT NULL DEFAULT TRUE;
