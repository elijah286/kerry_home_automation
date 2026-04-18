-- Ensure device_settings.device_id has a PRIMARY KEY constraint.
-- On some production instances the constraint is missing (same pattern as
-- 024_fix_integration_entries_pkey and 027_system_settings_pkey), causing
-- ON CONFLICT (device_id) to fail with "no unique or exclusion constraint".
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'device_settings'::regclass
      AND contype = 'p'
  ) THEN
    -- Remove duplicate device_id rows before adding the constraint
    DELETE FROM device_settings a
    USING device_settings b
    WHERE a.ctid < b.ctid
      AND a.device_id = b.device_id;

    ALTER TABLE device_settings ADD PRIMARY KEY (device_id);
  END IF;
END $$;
