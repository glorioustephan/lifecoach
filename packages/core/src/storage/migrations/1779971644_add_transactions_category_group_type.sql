-- Add Monarch category-group type to transactions so we can exclude
-- transfers (between accounts, credit-card payments, loan principal) from
-- monthly_burn / savings_rate snapshots. Without this column, every
-- negative-amount row was treated as an expense, inflating monthly burn by
-- the size of cash movements between owned accounts.
--
-- Known values from Monarch: 'income', 'expense', 'transfer'. NULL for rows
-- synced before this migration; the snapshot code falls back to a
-- name-based heuristic when the column is missing.

ALTER TABLE transactions ADD COLUMN category_group_type TEXT;
CREATE INDEX IF NOT EXISTS idx_transactions_category_group_type
  ON transactions(category_group_type);
