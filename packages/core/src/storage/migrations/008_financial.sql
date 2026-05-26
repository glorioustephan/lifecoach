-- Financial Dimension: accounts, transactions, budgets, holdings, and synthesized insights

-- Accounts synced from Monarch API
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,        -- Monarch account ID
  display_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('checking', 'savings', 'credit_card', 'investment', 'debt', 'other')),
  balance REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  institution TEXT,                       -- Bank/institution name
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'closed')),
  synced_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_accounts_external_id ON accounts(external_id);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(type);
CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);
CREATE INDEX IF NOT EXISTS idx_accounts_synced_at ON accounts(synced_at DESC);

-- Transactions imported from Monarch (batched, idempotent)
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  external_id TEXT NOT NULL,              -- Monarch transaction ID
  account_id TEXT NOT NULL,
  date INTEGER NOT NULL,                  -- Unix timestamp
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  merchant TEXT NOT NULL,
  category TEXT,
  description TEXT,
  is_pending INTEGER NOT NULL DEFAULT 0,
  notes TEXT,                             -- User-added annotations
  synced_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_transactions_merchant ON transactions(merchant);
CREATE INDEX IF NOT EXISTS idx_transactions_synced_at ON transactions(synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_external_id ON transactions(external_id);

-- Investment holdings snapshots (point-in-time portfolio state)
CREATE TABLE IF NOT EXISTS holdings (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  quantity REAL NOT NULL,
  current_price REAL NOT NULL,
  market_value REAL NOT NULL,
  cost_basis REAL,
  asset_type TEXT NOT NULL DEFAULT 'stock' CHECK (asset_type IN ('stock', 'fund', 'etf', 'crypto', 'commodity', 'other')),
  snapshot_date INTEGER NOT NULL,         -- When this snapshot was taken
  synced_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);
CREATE INDEX IF NOT EXISTS idx_holdings_account_id ON holdings(account_id);
CREATE INDEX IF NOT EXISTS idx_holdings_symbol ON holdings(symbol);
CREATE INDEX IF NOT EXISTS idx_holdings_snapshot_date ON holdings(snapshot_date DESC);

-- User budgets by category and month
CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  month TEXT NOT NULL,                    -- YYYY-MM format
  "limit" REAL NOT NULL,                  -- quoted: LIMIT is a SQLite reserved keyword
  spent REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category);
CREATE INDEX IF NOT EXISTS idx_budgets_month ON budgets(month DESC);
CREATE INDEX IF NOT EXISTS idx_budgets_category_month ON budgets(category, month);

-- Claude-synthesized financial insights
CREATE TABLE IF NOT EXISTS financial_insights (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('spending', 'debt', 'investment', 'cashflow')),
  priority INTEGER NOT NULL DEFAULT 1 CHECK (priority IN (1, 2, 3)),
  recommendation TEXT,
  source_data_ids TEXT NOT NULL DEFAULT '[]',  -- JSON array of transaction/account IDs
  dismissed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_financial_insights_category ON financial_insights(category);
CREATE INDEX IF NOT EXISTS idx_financial_insights_priority ON financial_insights(priority DESC);
CREATE INDEX IF NOT EXISTS idx_financial_insights_created_at ON financial_insights(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_insights_dismissed_at ON financial_insights(dismissed_at);
