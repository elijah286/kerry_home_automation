-- Chat history table for persisting messages with 24-hour rolling buffer
-- Stores user and assistant messages for conversation continuity across page refreshes

CREATE TABLE IF NOT EXISTS chat_history (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Index on user_id + created_at for efficient 24-hour window queries
CREATE INDEX IF NOT EXISTS idx_chat_history_user_created
  ON chat_history(user_id, created_at DESC);

-- Index on created_at for cleanup job
CREATE INDEX IF NOT EXISTS idx_chat_history_created
  ON chat_history(created_at);
