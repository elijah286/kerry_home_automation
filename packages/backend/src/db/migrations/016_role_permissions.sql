-- Stores customizable permission sets per role (overrides shared defaults)
CREATE TABLE IF NOT EXISTS role_permissions (
  role        TEXT PRIMARY KEY,
  permissions TEXT[] NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
