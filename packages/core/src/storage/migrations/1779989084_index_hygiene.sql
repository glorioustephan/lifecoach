-- Migration: 1779989084_index_hygiene.sql
-- Index hygiene sweep from the architectural audit (Wave 4.7).
--
-- 1. Drop redundant explicit indexes that duplicate an implicit UNIQUE
--    constraint index. Each write was paying the cost of maintaining both.
-- 2. Add partial / composite indexes covering the hot-path queries:
--      - facts: "WHERE valid_to IS NULL ORDER BY created_at DESC"
--      - financial_insights: "WHERE dismissed_at IS NULL ORDER BY priority DESC, created_at DESC"
--      - transactions: date-range + transfer-flag composite (rollup hot path)
-- 3. Enforce budget uniqueness at the database level — the prior
--    upsertBudget path used SELECT-then-INSERT/UPDATE, leaving a TOCTOU
--    race if a concurrent write ever happened.

-- ── Drop indexes duplicated by implicit UNIQUE-constraint indexes ────────
DROP INDEX IF EXISTS idx_accounts_external_id;
DROP INDEX IF EXISTS idx_transaction_overrides_external;

-- ── Active-facts partial index ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_facts_active_created
  ON facts(created_at DESC)
  WHERE valid_to IS NULL;

-- ── Active financial insights, sorted by priority + recency ──────────────
DROP INDEX IF EXISTS idx_financial_insights_dismissed_at;
CREATE INDEX IF NOT EXISTS idx_financial_insights_active_priority
  ON financial_insights(priority DESC, created_at DESC)
  WHERE dismissed_at IS NULL;

-- ── Transactions: date-range + transfer flag composite ───────────────────
-- Powers the rollup hot path. The leading date column carries the range
-- scan; is_transfer lets the planner skip transfer rows at the index level
-- once enough history is backfilled (1779979153 added the column).
CREATE INDEX IF NOT EXISTS idx_transactions_date_transfer
  ON transactions(date DESC, is_transfer, category_group_type);

-- ── Budgets: enforce one row per (category, month) at the DB level ──────
DROP INDEX IF EXISTS idx_budgets_category_month;
CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_category_month_unique
  ON budgets(category, month);
