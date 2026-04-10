CREATE TABLE state_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  device_id TEXT NOT NULL,
  state JSONB NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (changed_at);

CREATE INDEX idx_state_history_device_time ON state_history (device_id, changed_at DESC);

-- Create partition for current month and next month
DO $$
DECLARE
  start_date DATE := date_trunc('month', CURRENT_DATE);
  end_date DATE := start_date + INTERVAL '1 month';
  next_end DATE := end_date + INTERVAL '1 month';
  part_name TEXT;
  next_part_name TEXT;
BEGIN
  part_name := 'state_history_' || to_char(start_date, 'YYYY_MM');
  next_part_name := 'state_history_' || to_char(end_date, 'YYYY_MM');

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF state_history FOR VALUES FROM (%L) TO (%L)',
    part_name, start_date, end_date
  );
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF state_history FOR VALUES FROM (%L) TO (%L)',
    next_part_name, end_date, next_end
  );
END $$;
