-- Add archived_at column to sessions table for conversation archiving feature
ALTER TABLE sessions ADD COLUMN archived_at INTEGER;
CREATE INDEX IF NOT EXISTS idx_sessions_archived_at ON sessions(archived_at);
