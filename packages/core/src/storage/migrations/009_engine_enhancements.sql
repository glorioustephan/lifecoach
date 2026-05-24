-- Engine enhancement foundations:
-- - richer embedding metadata for reindex/eval safety
-- - structured reflection fields alongside the Markdown body
-- - generalized insight evidence refs
-- - deterministic attention signals
-- - cron/job run tracking and cooperative locks

ALTER TABLE embedding_refs ADD COLUMN model TEXT;
ALTER TABLE embedding_refs ADD COLUMN dimension INTEGER;
ALTER TABLE embedding_refs ADD COLUMN text_hash TEXT;
ALTER TABLE embedding_refs ADD COLUMN embedded_at INTEGER;
ALTER TABLE embedding_refs ADD COLUMN source_updated_at INTEGER;
UPDATE embedding_refs SET embedded_at = created_at WHERE embedded_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_embedding_refs_hash ON embedding_refs(text_hash);
CREATE INDEX IF NOT EXISTS idx_embedding_refs_embedded_at ON embedding_refs(embedded_at DESC);

ALTER TABLE reflections ADD COLUMN title TEXT;
ALTER TABLE reflections ADD COLUMN themes TEXT NOT NULL DEFAULT '[]';
ALTER TABLE reflections ADD COLUMN wins TEXT NOT NULL DEFAULT '[]';
ALTER TABLE reflections ADD COLUMN concerns TEXT NOT NULL DEFAULT '[]';
ALTER TABLE reflections ADD COLUMN open_threads TEXT NOT NULL DEFAULT '[]';
CREATE INDEX IF NOT EXISTS idx_reflections_created_at ON reflections(created_at DESC);

ALTER TABLE insights ADD COLUMN evidence_refs TEXT NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS attention_signals (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 1,
  evidence_refs TEXT NOT NULL DEFAULT '[]',
  dedup_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'active',
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  acted_on_at INTEGER,
  dismissed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_attention_signals_state
  ON attention_signals(state, priority DESC, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_attention_signals_kind
  ON attention_signals(kind, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS job_runs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  duration_ms INTEGER,
  error_summary TEXT,
  generated_refs TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_job_runs_name_started
  ON job_runs(name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_runs_status
  ON job_runs(status, started_at DESC);

CREATE TABLE IF NOT EXISTS job_locks (
  name TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES job_runs(id) ON DELETE CASCADE,
  locked_at INTEGER NOT NULL
);
