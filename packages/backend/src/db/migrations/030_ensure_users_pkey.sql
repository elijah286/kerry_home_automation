-- Idempotently ensure users.id has a PRIMARY KEY constraint.
--
-- Some older databases ended up with users.id as NOT NULL but without the
-- PRIMARY KEY constraint (likely from a pg_dump restore that dropped indexes
-- or an earlier migration path). Migration 029 (chat_history) has an FK to
-- users(id) which requires that constraint to exist.
--
-- This migration is safe to run multiple times — it only adds the PK if
-- it's missing, and deduplicates any accidental duplicate IDs first.

DO $$
BEGIN
  -- Only act if users.id doesn't already have a PRIMARY KEY
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'users'
      AND c.contype = 'p'
  ) THEN
    -- Safety: deduplicate by id before adding PK (keeps oldest row per id)
    DELETE FROM users a
    USING users b
    WHERE a.id = b.id
      AND a.ctid > b.ctid;

    ALTER TABLE users ADD PRIMARY KEY (id);
    RAISE NOTICE 'Added missing PRIMARY KEY to users.id';
  END IF;
END $$;
