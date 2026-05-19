-- Lifecoach initial schema
-- All tables use INTEGER timestamps in ms-since-epoch.

CREATE TABLE IF NOT EXISTS profile (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,                 -- JSON-encoded
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  summary TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_use TEXT,                       -- JSON-encoded
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_session_time ON messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);

CREATE TABLE IF NOT EXISTS facts (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  data TEXT,                           -- JSON-encoded
  source TEXT,
  confidence REAL NOT NULL DEFAULT 1.0,
  valid_from INTEGER,
  valid_to INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_facts_category ON facts(category);
CREATE INDEX IF NOT EXISTS idx_facts_subject ON facts(subject);
CREATE INDEX IF NOT EXISTS idx_facts_valid_to ON facts(valid_to);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  mime TEXT,
  title TEXT,
  body TEXT NOT NULL,
  metadata TEXT,                       -- JSON-encoded
  ingested_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_source ON documents(source);
CREATE INDEX IF NOT EXISTS idx_documents_ingested_at ON documents(ingested_at DESC);

CREATE TABLE IF NOT EXISTS measurements (
  id TEXT PRIMARY KEY,
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT,
  recorded_at INTEGER NOT NULL,
  source_document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_measurements_metric_time ON measurements(metric, recorded_at);

CREATE TABLE IF NOT EXISTS reflections (
  id TEXT PRIMARY KEY,
  period_start INTEGER NOT NULL,
  period_end INTEGER NOT NULL,
  kind TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reflections_kind_time ON reflections(kind, period_end DESC);

CREATE TABLE IF NOT EXISTS insights (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  body TEXT NOT NULL,
  rationale TEXT,
  source_fact_ids TEXT NOT NULL DEFAULT '[]',  -- JSON array
  created_at INTEGER NOT NULL,
  acted_on_at INTEGER,
  dismissed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_insights_topic ON insights(topic);
CREATE INDEX IF NOT EXISTS idx_insights_created_at ON insights(created_at DESC);

-- Maps embedding rowids to the entity they describe.
-- The actual FLOAT[N] virtual table is created in code so the dimension can be configured.
CREATE TABLE IF NOT EXISTS embedding_refs (
  embedding_rowid INTEGER PRIMARY KEY,
  ref_type TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_embedding_refs_target ON embedding_refs(ref_type, ref_id);

-- Lightweight metadata: store schema version, embedding dim, etc.
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
