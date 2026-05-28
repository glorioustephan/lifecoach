-- Migration: 1779980907_add_transactions_external_id_unique.sql
-- Enforce uniqueness on transactions.external_id at the schema level.
--
-- Background: upsertTransaction() does SELECT id FROM transactions WHERE
-- external_id = ? followed by INSERT or UPDATE. Under any concurrent write
-- this is a TOCTOU race that can produce duplicate rows. The Monarch sync
-- pipeline today is single-writer so the race has not bitten in production,
-- but the invariant should be enforced by the database.
--
-- This migration drops the non-unique index and creates a UNIQUE index in
-- its place. Pre-flight (manual): SELECT external_id, COUNT(*) FROM
-- transactions GROUP BY external_id HAVING COUNT(*) > 1; must return no
-- rows or the CREATE UNIQUE INDEX below will fail.

DROP INDEX IF EXISTS idx_transactions_external_id;
CREATE UNIQUE INDEX idx_transactions_external_id ON transactions(external_id);
