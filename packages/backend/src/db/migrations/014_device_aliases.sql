-- Add aliases column to device_settings for alternative device names
ALTER TABLE device_settings ADD COLUMN IF NOT EXISTS aliases TEXT[] DEFAULT '{}';
