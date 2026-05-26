-- Artifacts can now be surfaced from ingested documents (e.g. a recipe inside an
-- exported Capacities/markdown page), not just from chat conversations. Record
-- which document an artifact came from so its provenance stays honest.
ALTER TABLE artifacts ADD COLUMN source_document_id TEXT;
CREATE INDEX IF NOT EXISTS idx_artifacts_source_document ON artifacts(source_document_id);
