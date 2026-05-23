-- Artifacts: concrete, reusable, standardized-Markdown objects (recipes first)
-- extracted from conversations — either on demand via the "Save <type>" button
-- or by the daily extraction cron. Each row stores the formatted Markdown plus
-- provenance and a dedup key so the cron doesn't re-surface the same artifact.

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,                  -- plugin id, e.g. 'recipe'
  title TEXT NOT NULL,
  body TEXT NOT NULL,                  -- standardized Markdown
  category TEXT,
  tags TEXT NOT NULL DEFAULT '[]',     -- JSON array of strings
  confidence REAL,                     -- 0–1 when LLM-extracted; NULL for manual
  origin TEXT NOT NULL,                -- 'conversation' | 'cron' | 'manual'
  source_session_id TEXT,
  source_message_ids TEXT NOT NULL DEFAULT '[]', -- JSON array
  dedup_key TEXT,                      -- type + normalized title; cron dedup guard
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(type);
CREATE INDEX IF NOT EXISTS idx_artifacts_created_at ON artifacts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_artifacts_dedup ON artifacts(dedup_key);
