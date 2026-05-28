-- User corrections layered on top of Monarch's categorization. We never mutate
-- the synced `transactions.category` (so re-syncs don't fight overrides);
-- effective category is computed at read time as: per-txn override > merchant
-- rule > Monarch's category.

CREATE TABLE IF NOT EXISTS transaction_overrides (
  id TEXT PRIMARY KEY,
  transaction_external_id TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transaction_overrides_external
  ON transaction_overrides(transaction_external_id);

CREATE TABLE IF NOT EXISTS categorization_rules (
  id TEXT PRIMARY KEY,
  merchant_pattern TEXT NOT NULL,
  account_id TEXT,
  category TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_categorization_rules_priority
  ON categorization_rules(priority DESC, created_at DESC);
