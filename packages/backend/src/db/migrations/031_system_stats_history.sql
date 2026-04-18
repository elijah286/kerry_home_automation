-- Persist periodic system health samples so the UI can render CPU / memory /
-- disk over time. Sampling cadence is 30s (same as the system-monitor
-- alarm sampler) and we keep at most 7 days of history — roughly 20k rows,
-- trivial to query and prune.

CREATE TABLE IF NOT EXISTS system_stats_history (
  ts               TIMESTAMPTZ NOT NULL,
  cpu_percent      SMALLINT    NOT NULL,
  memory_percent   SMALLINT    NOT NULL,
  memory_used      BIGINT      NOT NULL,
  memory_total     BIGINT      NOT NULL,
  disk_percent     SMALLINT    NOT NULL,
  disk_used        BIGINT      NOT NULL,
  disk_total       BIGINT      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_system_stats_history_ts
  ON system_stats_history (ts DESC);
