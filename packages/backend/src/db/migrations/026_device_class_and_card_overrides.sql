-- ---------------------------------------------------------------------------
-- Device class taxonomy + per-user card overrides.
--
-- Two concerns in one migration because they're the same feature:
--   1. device_settings gets two new nullable columns to persist a device's
--      `device_class` classification (from the HA-aligned taxonomy in
--      @ha/shared/device-classes.ts) and its provenance. Classification
--      drives which card type the frontend resolver picks.
--   2. device_card_overrides is a per-user (userId × deviceId) store of
--      full CardDescriptor overrides, so any user can pick a non-default
--      card for any device without affecting other users.
-- ---------------------------------------------------------------------------

-- 1. Device class columns on the global device_settings table.
--    These are nullable — missing = "unclassified", which the UI surfaces
--    as a CTA ("Suggest a class" button that invokes the LLM inference
--    route). `device_class_source` records provenance so regenerate runs
--    and UI badges can distinguish bridge / admin / llm origins.
ALTER TABLE device_settings
  ADD COLUMN IF NOT EXISTS device_class TEXT,
  ADD COLUMN IF NOT EXISTS device_class_source TEXT
    CHECK (device_class_source IN ('bridge', 'admin', 'llm'));

-- Quick lookup for "which devices are unclassified?" (bulk inference page).
CREATE INDEX IF NOT EXISTS idx_device_settings_missing_class
  ON device_settings (device_id)
  WHERE device_class IS NULL;

-- 2. Per-user card overrides.
--    card_descriptor is the full CardDescriptor JSON — validated on write
--    by the route handler against `cardDescriptorSchema`. Zod parse failure
--    → 400. JSONB for flexibility; we don't query inside the blob today but
--    may want to later (e.g. "which users override X card type?").
CREATE TABLE IF NOT EXISTS device_card_overrides (
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  card_descriptor JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_device_card_overrides_user
  ON device_card_overrides (user_id);

CREATE INDEX IF NOT EXISTS idx_device_card_overrides_device
  ON device_card_overrides (device_id);
