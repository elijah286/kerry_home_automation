-- The primary key on integration_entries was found missing on at least one
-- production instance (causing ON CONFLICT (id) to fail with 42P10).
-- Re-add it idempotently so both fresh and existing installs are correct.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'integration_entries'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE integration_entries ADD PRIMARY KEY (id);
  END IF;
END $$;

-- Also restore the index if missing
CREATE INDEX IF NOT EXISTS idx_integration_entries_integration
  ON integration_entries(integration);
