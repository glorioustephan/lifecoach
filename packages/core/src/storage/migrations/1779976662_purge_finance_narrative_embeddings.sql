-- Purge poisoned finance narrative embedding references written before the
-- transfer-exclusion fix (finance-narratives.ts v2). These rows contained
-- raw income/expense figures that included Ally sweeps, credit-card
-- payments, and loan payments, which caused the chat agent to narrate
-- March income ($27,403) as "monthly burn".
--
-- Scope: all embedding_refs rows with ref_type = 'finance' whose ref_id
-- matches the "month:YYYY-MM" pattern (monthly narrative keys). Insight
-- narratives ("insight:<id>") are not purged — they don't contain rollup
-- arithmetic.
--
-- After this migration runs, the next call to indexFinanceNarratives()
-- will regenerate clean embeddings using transfer-excluded figures
-- (the indexFinanceNarrative() path always calls deleteForRef() before
-- inserting, so a normal daily sync is sufficient to repopulate).
--
-- Note on orphaned embeddings: the `embeddings` virtual (vec0) table is
-- created after migrations run in ensureEmbeddingTable(), so it cannot be
-- referenced here. Orphaned embedding vector rows whose embedding_rowid no
-- longer appears in embedding_refs are harmless — the search JOIN on
-- embedding_rowid will never return them. They will be vacuumed
-- naturally as new embeddings replace old rowids over time.
--
-- Strategy choice: delete-and-regenerate is lower-risk than adding a
-- narrative_schema_version column to embedding_refs, which would require
-- read-path changes in EmbeddingRepository.search() to filter by version.

DELETE FROM embedding_refs
WHERE ref_type = 'finance'
  AND ref_id LIKE 'month:%';
