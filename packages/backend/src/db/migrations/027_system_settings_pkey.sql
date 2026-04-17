-- Ensure system_settings.key has a PRIMARY KEY constraint.
-- The original 006 migration used CREATE TABLE IF NOT EXISTS, so on systems
-- where the table was created by an earlier schema the constraint was never
-- applied, causing ON CONFLICT (key) to fail at runtime.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'system_settings'
      AND constraint_type = 'PRIMARY KEY'
  ) THEN
    -- Remove any duplicate keys before adding the constraint
    DELETE FROM system_settings a
    USING system_settings b
    WHERE a.ctid < b.ctid
      AND a.key = b.key;

    ALTER TABLE system_settings ADD PRIMARY KEY (key);
  END IF;
END $$;
