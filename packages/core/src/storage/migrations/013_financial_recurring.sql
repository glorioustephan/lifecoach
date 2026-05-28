-- Add recurring-transaction signals so the coach can detect subscriptions and
-- propose cheaper alternatives. Sourced from Monarch's per-transaction
-- isRecurring + merchant.recurringTransactionStream { frequency }.
ALTER TABLE transactions ADD COLUMN is_recurring INTEGER NOT NULL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN recurring_frequency TEXT;
CREATE INDEX IF NOT EXISTS idx_transactions_recurring ON transactions(is_recurring);
