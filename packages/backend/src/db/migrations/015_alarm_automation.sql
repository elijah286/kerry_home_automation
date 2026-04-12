ALTER TABLE alarms ADD COLUMN automation_id TEXT REFERENCES automations(id) ON DELETE SET NULL;
