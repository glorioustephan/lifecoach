-- Phase 5.1 (Capacities integration).
--
-- Documents can now originate from external systems that we want to sync
-- idempotently. Mirrors the (external_source, external_id) pattern already
-- used by tasks (003_tasks.sql) — locally-ingested files still leave both
-- columns NULL.
--
-- Initial caller: the Capacities sync upserts each known object as a
-- documents row keyed by (external_source='capacities', external_id=<objectId>).
-- The unique partial index makes that upsert idempotent under repeated syncs.

ALTER TABLE documents ADD COLUMN external_id TEXT;
ALTER TABLE documents ADD COLUMN external_source TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_external
  ON documents(external_source, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_external_source
  ON documents(external_source)
  WHERE external_source IS NOT NULL;
