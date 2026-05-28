import type { Database } from "better-sqlite3";
import {
  accountType,
  accountStatus,
  assetType,
  budgetStatus,
  insightCategory,
  financialInsightPriority,
  type Account,
  type NewAccount,
  type Transaction,
  type NewTransaction,
  type Holding,
  type NewHolding,
  type Budget,
  type NewBudget,
  type FinancialInsight,
  type NewFinancialInsight,
  type TransactionOverride,
  type CategorizationRule,
  type AccountStatus,
  type AccountType,
} from "@lifecoach/schemas";
import { newId, now } from "../../util/ids.js";

interface AccountRow {
  id: string;
  external_id: string;
  display_name: string;
  type: string;
  balance: number;
  currency: string;
  institution: string | null;
  status: string;
  synced_at: number;
  created_at: number;
  updated_at: number;
}

interface TransactionRow {
  id: string;
  external_id: string;
  account_id: string;
  date: number;
  amount: number;
  currency: string;
  merchant: string;
  category: string | null;
  description: string | null;
  is_pending: number;
  notes: string | null;
  is_recurring: number;
  recurring_frequency: string | null;
  category_group_type: string | null;
  /** 1 = transfer, 0 = not transfer, NULL = unknown (pre-migration rows). */
  is_transfer: number | null;
  synced_at: number;
  created_at: number;
  updated_at: number;
}

interface HoldingRow {
  id: string;
  account_id: string;
  symbol: string;
  quantity: number;
  current_price: number;
  market_value: number;
  cost_basis: number | null;
  asset_type: string;
  snapshot_date: number;
  synced_at: number;
  created_at: number;
}

interface BudgetRow {
  id: string;
  category: string;
  month: string;
  limit: number;
  spent: number;
  status: string;
  created_at: number;
  updated_at: number;
}

interface TransactionOverrideRow {
  id: string;
  transaction_external_id: string;
  category: string;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

interface CategorizationRuleRow {
  id: string;
  merchant_pattern: string;
  account_id: string | null;
  category: string;
  priority: number;
  created_at: number;
  updated_at: number;
}

interface FinancialInsightRow {
  id: string;
  topic: string;
  body: string;
  category: string;
  priority: number;
  recommendation: string | null;
  source_data_ids: string;
  dismissed_at: number | null;
  created_at: number;
  updated_at: number;
}

// Row → domain mappers parse enum columns through their Zod validators rather
// than asserting via `as`. That gives us a runtime guard against corrupt rows
// (forces an early, named error) and erases the structural-cast risk if the
// enum is ever widened in schemas.
const rowToAccount = (row: AccountRow): Account => ({
  id: row.id,
  externalId: row.external_id,
  displayName: row.display_name,
  type: accountType.parse(row.type),
  balance: row.balance,
  currency: row.currency,
  institution: row.institution ?? undefined,
  status: accountStatus.parse(row.status),
  syncedAt: row.synced_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const rowToTransaction = (row: TransactionRow): Transaction => ({
  id: row.id,
  externalId: row.external_id,
  accountId: row.account_id,
  date: row.date,
  amount: row.amount,
  currency: row.currency,
  merchant: row.merchant,
  category: row.category ?? undefined,
  description: row.description ?? undefined,
  isPending: row.is_pending === 1,
  notes: row.notes ?? undefined,
  isRecurring: row.is_recurring === 1,
  recurringFrequency: row.recurring_frequency ?? undefined,
  categoryGroupType: row.category_group_type ?? undefined,
  isTransfer: row.is_transfer == null ? undefined : row.is_transfer === 1,
  syncedAt: row.synced_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const rowToHolding = (row: HoldingRow): Holding => ({
  id: row.id,
  accountId: row.account_id,
  symbol: row.symbol,
  quantity: row.quantity,
  currentPrice: row.current_price,
  marketValue: row.market_value,
  costBasis: row.cost_basis ?? undefined,
  assetType: assetType.parse(row.asset_type),
  snapshotDate: row.snapshot_date,
  syncedAt: row.synced_at,
  createdAt: row.created_at,
});

const rowToBudget = (row: BudgetRow): Budget => ({
  id: row.id,
  category: row.category,
  month: row.month,
  limit: row.limit,
  spent: row.spent,
  status: budgetStatus.parse(row.status),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const rowToOverride = (row: TransactionOverrideRow): TransactionOverride => ({
  id: row.id,
  transactionExternalId: row.transaction_external_id,
  category: row.category,
  notes: row.notes ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const rowToRule = (row: CategorizationRuleRow): CategorizationRule => ({
  id: row.id,
  merchantPattern: row.merchant_pattern,
  accountId: row.account_id ?? undefined,
  category: row.category,
  priority: row.priority,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * In-memory snapshot of all user corrections for one query. Built once per
 * `queryTransactions` / `getTransaction` call and applied to each returned row
 * via {@link applyEffectiveCategory}. Centralizing here means every consumer
 * (Insighter financial rollup, finances route, agent tools, snapshot-metrics)
 * sees consistent corrected categories without sprinkled SQL joins.
 */
interface CategorizationContext {
  overrides: Map<string, TransactionOverride>;
  /** Rules pre-sorted by priority DESC, then created_at DESC (deterministic). */
  rules: CategorizationRule[];
}

const applyEffectiveCategory = (t: Transaction, ctx: CategorizationContext): Transaction => {
  const override = ctx.overrides.get(t.externalId);
  if (override) return { ...t, category: override.category };
  if (ctx.rules.length === 0) return t;
  const merchantLower = t.merchant.toLowerCase();
  for (const r of ctx.rules) {
    if (r.accountId && r.accountId !== t.accountId) continue;
    if (merchantLower.includes(r.merchantPattern.toLowerCase())) {
      return { ...t, category: r.category };
    }
  }
  return t;
};

const rowToFinancialInsight = (row: FinancialInsightRow): FinancialInsight => ({
  id: row.id,
  topic: row.topic,
  body: row.body,
  category: insightCategory.parse(row.category),
  priority: financialInsightPriority.parse(row.priority),
  recommendation: row.recommendation ?? undefined,
  sourceDataIds: JSON.parse(row.source_data_ids) as string[],
  dismissedAt: row.dismissed_at ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class FinancialRepository {
  constructor(private readonly db: Database) {}

  // ─── Accounts ────────────────────────────────────────────────────────────

  createAccount(account: NewAccount): Account {
    const id = newId();
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO accounts(id, external_id, display_name, type, balance, currency, institution, status, synced_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        account.externalId,
        account.displayName,
        account.type,
        account.balance,
        account.currency,
        account.institution ?? null,
        account.status,
        account.syncedAt,
        ts,
        ts,
      );
    return { id, ...account, createdAt: ts, updatedAt: ts };
  }

  getAccount(id: string): Account | undefined {
    const row = this.db
      .prepare(
        `SELECT id, external_id, display_name, type, balance, currency, institution, status, synced_at, created_at, updated_at
         FROM accounts WHERE id = ?`,
      )
      .get(id) as AccountRow | undefined;
    return row ? rowToAccount(row) : undefined;
  }

  getAccountByExternalId(externalId: string): Account | undefined {
    const row = this.db
      .prepare(
        `SELECT id, external_id, display_name, type, balance, currency, institution, status, synced_at, created_at, updated_at
         FROM accounts WHERE external_id = ?`,
      )
      .get(externalId) as AccountRow | undefined;
    return row ? rowToAccount(row) : undefined;
  }

  listAccounts(filter?: { status?: AccountStatus; type?: AccountType }): Account[] {
    let sql =
      `SELECT id, external_id, display_name, type, balance, currency, institution, status, synced_at, created_at, updated_at
       FROM accounts WHERE 1=1`;
    const params: unknown[] = [];

    if (filter?.status) {
      sql += ` AND status = ?`;
      params.push(filter.status);
    }
    if (filter?.type) {
      sql += ` AND type = ?`;
      params.push(filter.type);
    }

    sql += ` ORDER BY created_at DESC`;
    const rows = this.db.prepare(sql).all(...params) as AccountRow[];
    return rows.map(rowToAccount);
  }

  updateAccount(id: string, patch: { balance?: number; status?: AccountStatus; syncedAt?: number }): Account | undefined {
    const existing = this.getAccount(id);
    if (!existing) return undefined;

    const updated = { ...existing, ...patch, updatedAt: now() };
    const ts = now();

    this.db
      .prepare(
        `UPDATE accounts SET balance = ?, status = ?, synced_at = ?, updated_at = ? WHERE id = ?`,
      )
      .run(updated.balance, updated.status, updated.syncedAt, ts, id);

    return updated;
  }

  // ─── Transactions ────────────────────────────────────────────────────────

  updateTransactionNotes(id: string, notes: string): Transaction | undefined {
    const existing = this.getTransaction(id);
    if (!existing) return undefined;
    const ts = now();
    this.db
      .prepare(`UPDATE transactions SET notes = ?, updated_at = ? WHERE id = ?`)
      .run(notes, ts, id);
    return { ...existing, notes, updatedAt: ts };
  }

  createTransaction(transaction: NewTransaction): Transaction {
    const id = newId();
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO transactions(id, external_id, account_id, date, amount, currency, merchant, category, description, is_pending, notes, is_recurring, recurring_frequency, category_group_type, is_transfer, synced_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        transaction.externalId,
        transaction.accountId,
        transaction.date,
        transaction.amount,
        transaction.currency,
        transaction.merchant,
        transaction.category ?? null,
        transaction.description ?? null,
        transaction.isPending ? 1 : 0,
        transaction.notes ?? null,
        transaction.isRecurring ? 1 : 0,
        transaction.recurringFrequency ?? null,
        transaction.categoryGroupType ?? null,
        transaction.isTransfer == null ? null : transaction.isTransfer ? 1 : 0,
        transaction.syncedAt,
        ts,
        ts,
      );
    return { id, ...transaction, createdAt: ts, updatedAt: ts };
  }

  upsertTransaction(transaction: NewTransaction): Transaction {
    const existing = this.db
      .prepare(`SELECT id FROM transactions WHERE external_id = ?`)
      .get(transaction.externalId) as { id: string } | undefined;

    if (existing) {
      const ts = now();
      // Re-sync also reconciles account_id so historical rows mis-linked to a
      // sentinel account heal once the real per-transaction account is known.
      this.db
        .prepare(
          `UPDATE transactions SET account_id = ?, amount = ?, merchant = ?, category = ?, description = ?, is_pending = ?, is_recurring = ?, recurring_frequency = ?, category_group_type = ?, is_transfer = ?, synced_at = ?, updated_at = ? WHERE id = ?`,
        )
        .run(
          transaction.accountId,
          transaction.amount,
          transaction.merchant,
          transaction.category ?? null,
          transaction.description ?? null,
          transaction.isPending ? 1 : 0,
          transaction.isRecurring ? 1 : 0,
          transaction.recurringFrequency ?? null,
          transaction.categoryGroupType ?? null,
          transaction.isTransfer == null ? null : transaction.isTransfer ? 1 : 0,
          transaction.syncedAt,
          ts,
          existing.id,
        );
      return this.getTransaction(existing.id)!;
    }
    return this.createTransaction(transaction);
  }

  getTransaction(id: string): Transaction | undefined {
    const row = this.db
      .prepare(
        `SELECT id, external_id, account_id, date, amount, currency, merchant, category, description, is_pending, notes, is_recurring, recurring_frequency, category_group_type, is_transfer, synced_at, created_at, updated_at
         FROM transactions WHERE id = ?`,
      )
      .get(id) as TransactionRow | undefined;
    if (!row) return undefined;
    const ctx = this.resolveCategorization();
    return applyEffectiveCategory(rowToTransaction(row), ctx);
  }

  queryTransactions(filters?: {
    accountId?: string;
    from?: number;
    to?: number;
    category?: string;
    minAmount?: number;
  }): Transaction[] {
    // SQL filters never use the raw `category` column — a transaction's
    // EFFECTIVE category may differ (override > rule > raw). We fetch without
    // a category filter and apply both the corrections and any category filter
    // in JS, so every consumer sees one consistent corrected view.
    let sql = `SELECT id, external_id, account_id, date, amount, currency, merchant, category, description, is_pending, notes, is_recurring, recurring_frequency, category_group_type, is_transfer, synced_at, created_at, updated_at FROM transactions WHERE 1=1`;
    const params: unknown[] = [];

    if (filters?.accountId) {
      sql += ` AND account_id = ?`;
      params.push(filters.accountId);
    }
    if (filters?.from !== undefined) {
      sql += ` AND date >= ?`;
      params.push(filters.from);
    }
    if (filters?.to !== undefined) {
      sql += ` AND date <= ?`;
      params.push(filters.to);
    }
    if (filters?.minAmount !== undefined) {
      sql += ` AND ABS(amount) >= ?`;
      params.push(filters.minAmount);
    }

    sql += ` ORDER BY date DESC`;
    const rows = this.db.prepare(sql).all(...params) as TransactionRow[];
    const ctx = this.resolveCategorization();
    const corrected = rows.map((r) => applyEffectiveCategory(rowToTransaction(r), ctx));
    if (filters?.category) {
      const cat = filters.category;
      return corrected.filter((t) => t.category === cat);
    }
    return corrected;
  }

  // ─── Categorization overrides + rules ─────────────────────────────────────
  // User corrections to Monarch's categorization. Applied at READ time so
  // re-syncs never overwrite them. Effective category is computed via
  // {@link applyEffectiveCategory} as: per-txn override > merchant rule > raw.

  private resolveCategorization(): CategorizationContext {
    const overrideRows = this.db
      .prepare(
        `SELECT id, transaction_external_id, category, notes, created_at, updated_at
         FROM transaction_overrides`,
      )
      .all() as TransactionOverrideRow[];
    const overrides = new Map<string, TransactionOverride>();
    for (const r of overrideRows) overrides.set(r.transaction_external_id, rowToOverride(r));
    const ruleRows = this.db
      .prepare(
        `SELECT id, merchant_pattern, account_id, category, priority, created_at, updated_at
         FROM categorization_rules
         ORDER BY priority DESC, created_at DESC`,
      )
      .all() as CategorizationRuleRow[];
    const rules = ruleRows.map(rowToRule);
    return { overrides, rules };
  }

  upsertTransactionOverride(input: {
    transactionExternalId: string;
    category: string;
    notes?: string;
  }): TransactionOverride {
    const ts = now();
    const existing = this.db
      .prepare(`SELECT id FROM transaction_overrides WHERE transaction_external_id = ?`)
      .get(input.transactionExternalId) as { id: string } | undefined;
    if (existing) {
      this.db
        .prepare(
          `UPDATE transaction_overrides SET category = ?, notes = ?, updated_at = ? WHERE id = ?`,
        )
        .run(input.category, input.notes ?? null, ts, existing.id);
      return this.getOverrideById(existing.id)!;
    }
    const id = newId();
    this.db
      .prepare(
        `INSERT INTO transaction_overrides(id, transaction_external_id, category, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.transactionExternalId, input.category, input.notes ?? null, ts, ts);
    return this.getOverrideById(id)!;
  }

  private getOverrideById(id: string): TransactionOverride | undefined {
    const row = this.db
      .prepare(
        `SELECT id, transaction_external_id, category, notes, created_at, updated_at
         FROM transaction_overrides WHERE id = ?`,
      )
      .get(id) as TransactionOverrideRow | undefined;
    return row ? rowToOverride(row) : undefined;
  }

  listTransactionOverrides(): TransactionOverride[] {
    const rows = this.db
      .prepare(
        `SELECT id, transaction_external_id, category, notes, created_at, updated_at
         FROM transaction_overrides ORDER BY updated_at DESC`,
      )
      .all() as TransactionOverrideRow[];
    return rows.map(rowToOverride);
  }

  deleteTransactionOverride(transactionExternalId: string): boolean {
    const r = this.db
      .prepare(`DELETE FROM transaction_overrides WHERE transaction_external_id = ?`)
      .run(transactionExternalId);
    return r.changes > 0;
  }

  createCategorizationRule(input: {
    merchantPattern: string;
    accountId?: string;
    category: string;
    priority?: number;
  }): CategorizationRule {
    const id = newId();
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO categorization_rules(id, merchant_pattern, account_id, category, priority, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.merchantPattern,
        input.accountId ?? null,
        input.category,
        input.priority ?? 100,
        ts,
        ts,
      );
    return this.getCategorizationRule(id)!;
  }

  getCategorizationRule(id: string): CategorizationRule | undefined {
    const row = this.db
      .prepare(
        `SELECT id, merchant_pattern, account_id, category, priority, created_at, updated_at
         FROM categorization_rules WHERE id = ?`,
      )
      .get(id) as CategorizationRuleRow | undefined;
    return row ? rowToRule(row) : undefined;
  }

  listCategorizationRules(): CategorizationRule[] {
    const rows = this.db
      .prepare(
        `SELECT id, merchant_pattern, account_id, category, priority, created_at, updated_at
         FROM categorization_rules
         ORDER BY priority DESC, created_at DESC`,
      )
      .all() as CategorizationRuleRow[];
    return rows.map(rowToRule);
  }

  deleteCategorizationRule(id: string): boolean {
    const r = this.db.prepare(`DELETE FROM categorization_rules WHERE id = ?`).run(id);
    return r.changes > 0;
  }

  // ─── Holdings ────────────────────────────────────────────────────────────

  createHolding(holding: NewHolding): Holding {
    const id = newId();
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO holdings(id, account_id, symbol, quantity, current_price, market_value, cost_basis, asset_type, snapshot_date, synced_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        holding.accountId,
        holding.symbol,
        holding.quantity,
        holding.currentPrice,
        holding.marketValue,
        holding.costBasis ?? null,
        holding.assetType,
        holding.snapshotDate,
        holding.syncedAt,
        ts,
      );
    return { id, ...holding, createdAt: ts };
  }

  queryHoldings(filters?: { accountId?: string; symbol?: string }): Holding[] {
    let sql = `SELECT id, account_id, symbol, quantity, current_price, market_value, cost_basis, asset_type, snapshot_date, synced_at, created_at FROM holdings WHERE 1=1`;
    const params: unknown[] = [];

    if (filters?.accountId) {
      sql += ` AND account_id = ?`;
      params.push(filters.accountId);
    }
    if (filters?.symbol) {
      sql += ` AND symbol = ?`;
      params.push(filters.symbol);
    }

    sql += ` ORDER BY snapshot_date DESC, account_id ASC`;
    const rows = this.db.prepare(sql).all(...params) as HoldingRow[];
    return rows.map(rowToHolding);
  }

  // ─── Budgets ─────────────────────────────────────────────────────────────

  createBudget(budget: NewBudget): Budget {
    const id = newId();
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO budgets(id, category, month, "limit", spent, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, budget.category, budget.month, budget.limit, budget.spent ?? 0, budget.status, ts, ts);
    return { id, ...budget, spent: budget.spent ?? 0, createdAt: ts, updatedAt: ts };
  }

  upsertBudget(budget: NewBudget): Budget {
    const existing = this.db
      .prepare(`SELECT id FROM budgets WHERE category = ? AND month = ?`)
      .get(budget.category, budget.month) as { id: string } | undefined;

    if (existing) {
      const ts = now();
      this.db
        .prepare(`UPDATE budgets SET "limit" = ?, spent = ?, status = ?, updated_at = ? WHERE id = ?`)
        .run(budget.limit, budget.spent ?? 0, budget.status, ts, existing.id);
      return this.getBudget(existing.id)!;
    }
    return this.createBudget(budget);
  }

  getBudget(id: string): Budget | undefined {
    const row = this.db
      .prepare(
        `SELECT id, category, month, "limit", spent, status, created_at, updated_at FROM budgets WHERE id = ?`,
      )
      .get(id) as BudgetRow | undefined;
    return row ? rowToBudget(row) : undefined;
  }

  getBudgetByMonthAndCategory(month: string, category: string): Budget | undefined {
    const row = this.db
      .prepare(
        `SELECT id, category, month, "limit", spent, status, created_at, updated_at FROM budgets WHERE month = ? AND category = ?`,
      )
      .get(month, category) as BudgetRow | undefined;
    return row ? rowToBudget(row) : undefined;
  }

  listBudgets(month?: string): Budget[] {
    let sql = `SELECT id, category, month, "limit", spent, status, created_at, updated_at FROM budgets WHERE 1=1`;
    const params: unknown[] = [];

    if (month) {
      sql += ` AND month = ?`;
      params.push(month);
    }

    sql += ` ORDER BY month DESC, category ASC`;
    const rows = this.db.prepare(sql).all(...params) as BudgetRow[];
    return rows.map(rowToBudget);
  }

  // ─── Financial Insights ──────────────────────────────────────────────────

  createInsight(insight: NewFinancialInsight): FinancialInsight {
    const id = newId();
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO financial_insights(id, topic, body, category, priority, recommendation, source_data_ids, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        insight.topic,
        insight.body,
        insight.category,
        insight.priority,
        insight.recommendation ?? null,
        JSON.stringify(insight.sourceDataIds ?? []),
        ts,
        ts,
      );
    return { id, ...insight, createdAt: ts, updatedAt: ts };
  }

  getInsight(id: string): FinancialInsight | undefined {
    const row = this.db
      .prepare(
        `SELECT id, topic, body, category, priority, recommendation, source_data_ids, dismissed_at, created_at, updated_at FROM financial_insights WHERE id = ?`,
      )
      .get(id) as FinancialInsightRow | undefined;
    return row ? rowToFinancialInsight(row) : undefined;
  }

  listInsights(filters?: { category?: string; priority?: number; dismissedOnly?: boolean }): FinancialInsight[] {
    let sql = `SELECT id, topic, body, category, priority, recommendation, source_data_ids, dismissed_at, created_at, updated_at FROM financial_insights WHERE 1=1`;
    const params: unknown[] = [];

    if (filters?.category) {
      sql += ` AND category = ?`;
      params.push(filters.category);
    }
    if (filters?.priority !== undefined) {
      sql += ` AND priority >= ?`;
      params.push(filters.priority);
    }
    if (!filters?.dismissedOnly) {
      sql += ` AND dismissed_at IS NULL`;
    }

    sql += ` ORDER BY priority DESC, created_at DESC`;
    const rows = this.db.prepare(sql).all(...params) as FinancialInsightRow[];
    return rows.map(rowToFinancialInsight);
  }

  dismissInsight(id: string): FinancialInsight | undefined {
    const ts = now();
    this.db.prepare(`UPDATE financial_insights SET dismissed_at = ? WHERE id = ?`).run(ts, id);
    return this.getInsight(id);
  }
}
