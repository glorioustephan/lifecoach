-- Tracks files that have been ingested, keyed by content hash so re-dropping
-- the same file (or moving it) is idempotent.

CREATE TABLE IF NOT EXISTS ingested_files (
  hash TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  size_bytes INTEGER NOT NULL,
  ingested_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ingested_files_path ON ingested_files(path);
CREATE INDEX IF NOT EXISTS idx_ingested_files_doc ON ingested_files(document_id);
