-- Migration: 1779979153_add_transactions_is_transfer.sql
-- Adds Monarch's own boolean transfer flag to the transactions table.
-- NULL = unknown (rows synced before this migration); 1 = transfer; 0 = not transfer.
-- The is_transfer flag is priority-1 in isTransferTxn() — see
-- packages/core/src/financial/transfer.ts tier-0 check.

ALTER TABLE transactions ADD COLUMN is_transfer INTEGER DEFAULT NULL;
