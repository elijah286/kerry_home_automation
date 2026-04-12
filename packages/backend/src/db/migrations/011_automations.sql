-- Automations: trigger/condition/action definitions
CREATE TABLE automations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  group_name TEXT,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  mode TEXT NOT NULL DEFAULT 'single',
  definition JSONB NOT NULL,
  last_triggered TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Execution history log
CREATE TABLE automation_execution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trigger_type TEXT NOT NULL,
  trigger_detail JSONB,
  conditions_passed BOOLEAN,
  actions_executed JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'running',
  error TEXT,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_exec_log_automation ON automation_execution_log(automation_id, triggered_at DESC);
CREATE INDEX idx_exec_log_time ON automation_execution_log(triggered_at DESC);
