import { describe, expect, it, afterEach, beforeEach } from "vitest";
import {
  buildMonthlyRollup,
  buildCategorySubtotals,
  buildCalendarMonthRollup,
  detectOutlierMonths,
  evaluateGuards,
} from "./rollup.js";
import { isTransferTxn } from "./transfer.js";
import { createTestStorage, type TestStorageHandle } from "../testing/test-storage.js";

// ── buildMonthlyRollup — pure function tests ──────────────────────────────────

describe("buildMonthlyRollup — contributing_tx_ids", () => {
  it("includes IDs of non-transfer income transactions", () => {
    const now = Date.now();
    const rollup = buildMonthlyRollup({
      transactions: [
        { id: "tx-income-1", amount: 5000, category: "Paycheck", categoryGroupType: "income" },
        { id: "tx-expense-1", amount: -2000, category: "Rent", categoryGroupType: "expense" },
      ],
      period: "2026-05",
      windowType: "calendar_month",
      fromMs: now - 86400000 * 30,
      toMs: now,
    });
    expect(rollup.contributingTxIds).toContain("tx-income-1");
    expect(rollup.contributingTxIds).toContain("tx-expense-1");
    expect(rollup.contributingTxIds).toHaveLength(2);
  });

  it("excludes transfer transactions from contributing_tx_ids", () => {
    const now = Date.now();
    const rollup = buildMonthlyRollup({
      transactions: [
        { id: "tx-income-1", amount: 5000, category: "Paycheck", categoryGroupType: "income" },
        {
          id: "tx-transfer-1",
          amount: 3000,
          category: "Transfer",
          categoryGroupType: "transfer",
        },
        {
          id: "tx-loan-1",
          amount: -1200,
          category: "Loan Payment",
          categoryGroupType: undefined,
        },
        { id: "tx-expense-1", amount: -800, category: "Groceries", categoryGroupType: "expense" },
      ],
      period: "2026-05",
      windowType: "calendar_month",
      fromMs: now - 86400000 * 30,
      toMs: now,
    });

    // tx-transfer-1 has categoryGroupType=transfer → excluded
    // tx-loan-1 has no categoryGroupType but category "Loan Payment" → excluded by name match
    expect(rollup.contributingTxIds).toContain("tx-income-1");
    expect(rollup.contributingTxIds).toContain("tx-expense-1");
    expect(rollup.contributingTxIds).not.toContain("tx-transfer-1");
    expect(rollup.contributingTxIds).not.toContain("tx-loan-1");
    expect(rollup.contributingTxIds).toHaveLength(2);
  });

  it("transfer tx IDs are stored in transferTxIds, not contributingTxIds", () => {
    const now = Date.now();
    const rollup = buildMonthlyRollup({
      transactions: [
        { id: "tx-transfer-1", amount: 3000, category: "Transfer", categoryGroupType: "transfer" },
        { id: "tx-cc-payment", amount: -1500, category: "Credit Card Payment", categoryGroupType: undefined },
      ],
      period: "2026-05",
      windowType: "calendar_month",
      fromMs: now - 86400000 * 30,
      toMs: now,
    });

    expect(rollup.transferTxIds).toContain("tx-transfer-1");
    expect(rollup.transferTxIds).toContain("tx-cc-payment");
    expect(rollup.contributingTxIds).toHaveLength(0);
  });

  it("returns empty contributingTxIds for a zero-contributor rollup (not null)", () => {
    const now = Date.now();
    const rollup = buildMonthlyRollup({
      transactions: [
        { id: "tx-transfer-1", amount: 1000, category: "Transfer", categoryGroupType: "transfer" },
      ],
      period: "2026-05",
      windowType: "calendar_month",
      fromMs: now - 86400000 * 30,
      toMs: now,
    });

    // G5 contract: empty array, never null/undefined.
    expect(rollup.contributingTxIds).toEqual([]);
    expect(rollup.contributingTxIds).not.toBeNull();
  });

  it("computes correct income and expense totals with transfers excluded", () => {
    const now = Date.now();
    const rollup = buildMonthlyRollup({
      transactions: [
        { id: "p1", amount: 7000, category: "Paycheck", categoryGroupType: "income" },
        { id: "t1", amount: 2000, category: "Transfer", categoryGroupType: "transfer" },
        { id: "e1", amount: -2500, category: "Rent", categoryGroupType: "expense" },
        { id: "e2", amount: -500, category: "Groceries", categoryGroupType: "expense" },
      ],
      period: "2026-05",
      windowType: "calendar_month",
      fromMs: now - 86400000 * 30,
      toMs: now,
    });

    expect(rollup.income).toBeCloseTo(7000);
    expect(rollup.expenses).toBeCloseTo(3000);
    expect(rollup.burn).toBeCloseTo(3000);
    expect(rollup.savingsRate).toBeCloseTo(((7000 - 3000) / 7000) * 100, 1);
  });

  it("savingsRate is NaN when income is zero (G6 guard fails)", () => {
    const now = Date.now();
    const rollup = buildMonthlyRollup({
      transactions: [
        { id: "t1", amount: 2000, category: "Transfer", categoryGroupType: "transfer" },
      ],
      period: "2026-05",
      windowType: "calendar_month",
      fromMs: now - 86400000 * 30,
      toMs: now,
    });

    expect(isNaN(rollup.savingsRate)).toBe(true);
    const g6 = rollup.guardsPassed.find((g) => g.guard === "G6");
    expect(g6?.passed).toBe(false);
  });
});

// ── G5 guard evaluation ───────────────────────────────────────────────────────

describe("evaluateGuards — G5 itemization", () => {
  it("G5 passes when contributingTxIds is non-empty", () => {
    const guards = evaluateGuards("calendar_month", 30, 5000, 0, 0, ["tx-1"], false);
    const g5 = guards.find((g) => g.guard === "G5");
    expect(g5?.passed).toBe(true);
  });

  it("G5 fails when contributingTxIds is empty", () => {
    const guards = evaluateGuards("calendar_month", 30, 5000, 0, 0, [], false);
    const g5 = guards.find((g) => g.guard === "G5");
    expect(g5?.passed).toBe(false);
  });

  it("G1 fails for MTD with < 15 days", () => {
    const guards = evaluateGuards("mtd", 10, 5000, 0, 0, ["tx-1"], false);
    const g1 = guards.find((g) => g.guard === "G1");
    expect(g1?.passed).toBe(false);
    expect(g1?.detail).toMatch(/10 days/);
  });

  it("G1 passes for MTD with exactly 15 days", () => {
    const guards = evaluateGuards("mtd", 15, 5000, 0, 0, ["tx-1"], false);
    const g1 = guards.find((g) => g.guard === "G1");
    expect(g1?.passed).toBe(true);
  });

  it("G2 fails when transfer ratio >= 0.20", () => {
    const guards = evaluateGuards("calendar_month", 30, 5000, 2000, 0.25, ["tx-1"], false);
    const g2 = guards.find((g) => g.guard === "G2");
    expect(g2?.passed).toBe(false);
  });

  it("G3 fails when outlier month detected", () => {
    const guards = evaluateGuards("calendar_month", 30, 5000, 0, 0, ["tx-1"], true);
    const g3 = guards.find((g) => g.guard === "G3");
    expect(g3?.passed).toBe(false);
  });
});

// ── Transfer exclusion — IDs are consistently excluded ───────────────────────

describe("buildMonthlyRollup — transfer IDs never in contributingTxIds", () => {
  it("category-name transfer rows are not in contributing IDs", () => {
    const now = Date.now();
    const rollup = buildMonthlyRollup({
      transactions: [
        // Fallback category-name patterns (no categoryGroupType set)
        { id: "tx-cc-pay", amount: -1000, category: "Credit Card Payment", categoryGroupType: undefined },
        { id: "tx-internal", amount: 500, category: "Internal Transfer", categoryGroupType: undefined },
        { id: "tx-balance-adj", amount: 100, category: "Balance Adjustment", categoryGroupType: undefined },
        // Real transaction.
        { id: "tx-paycheck", amount: 6000, category: "Paycheck", categoryGroupType: "income" },
      ],
      period: "2026-05",
      windowType: "calendar_month",
      fromMs: now - 86400000 * 30,
      toMs: now,
    });

    expect(rollup.contributingTxIds).toEqual(["tx-paycheck"]);
    expect(rollup.transferTxIds).toContain("tx-cc-pay");
    expect(rollup.transferTxIds).toContain("tx-internal");
    expect(rollup.transferTxIds).toContain("tx-balance-adj");
  });
});

// ── buildCategorySubtotals ───────────────────────────────────────────────────

describe("buildCategorySubtotals", () => {
  it("groups expenses by category with correct tx IDs, transfers excluded", () => {
    const txns = [
      { id: "g1", amount: -100, category: "Groceries", categoryGroupType: "expense" },
      { id: "g2", amount: -200, category: "Groceries", categoryGroupType: "expense" },
      { id: "d1", amount: -50, category: "Dining", categoryGroupType: "expense" },
      { id: "t1", amount: -500, category: "Transfer", categoryGroupType: "transfer" },
      { id: "i1", amount: 3000, category: "Paycheck", categoryGroupType: "income" }, // income excluded
    ];
    const subtotals = buildCategorySubtotals(txns);
    const groceries = subtotals.find((s) => s.category === "Groceries");
    const dining = subtotals.find((s) => s.category === "Dining");
    const transfer = subtotals.find((s) => s.category === "Transfer");

    expect(groceries?.total).toBeCloseTo(300);
    expect(groceries?.txIds).toContain("g1");
    expect(groceries?.txIds).toContain("g2");
    expect(dining?.total).toBeCloseTo(50);
    expect(dining?.txIds).toEqual(["d1"]);
    expect(transfer).toBeUndefined(); // excluded
  });

  it("sorts by total descending", () => {
    const txns = [
      { id: "a", amount: -10, category: "A", categoryGroupType: "expense" },
      { id: "b", amount: -500, category: "B", categoryGroupType: "expense" },
      { id: "c", amount: -100, category: "C", categoryGroupType: "expense" },
    ];
    const subtotals = buildCategorySubtotals(txns);
    expect(subtotals[0]?.category).toBe("B");
    expect(subtotals[1]?.category).toBe("C");
    expect(subtotals[2]?.category).toBe("A");
  });
});

// ── detectOutlierMonths ──────────────────────────────────────────────────────

describe("detectOutlierMonths", () => {
  it("detects outlier when one month is > 1.5x median", () => {
    // Normal months: 2000, 2100, 1900, 2000, 2050. Outlier: 4500.
    expect(detectOutlierMonths([2000, 2100, 1900, 2000, 2050, 4500])).toBe(true);
  });

  it("no outlier for uniform spending", () => {
    expect(detectOutlierMonths([2000, 2000, 2000, 2000, 2000])).toBe(false);
  });

  it("returns false with fewer than 2 months (insufficient baseline)", () => {
    expect(detectOutlierMonths([5000])).toBe(false);
    expect(detectOutlierMonths([])).toBe(false);
  });
});

// ── buildCalendarMonthRollup — integration with test storage ─────────────────

describe("buildCalendarMonthRollup via test storage", () => {
  let handle: TestStorageHandle | null = null;

  beforeEach(() => {
    handle = createTestStorage();
  });

  afterEach(() => {
    handle?.cleanup();
    handle = null;
  });

  it("rollup matches storage transactions for a calendar month", () => {
    const storage = handle!.storage;

    // April 2026 data.
    const APR_1 = Date.UTC(2026, 3, 1, 12, 0, 0);
    const APR_5 = Date.UTC(2026, 3, 5, 12, 0, 0);
    const APR_15 = Date.UTC(2026, 3, 15, 12, 0, 0);

    const acct = storage.financial.createAccount({
      externalId: "ext-checking",
      displayName: "Checking",
      type: "checking",
      balance: 10000,
      currency: "USD",
      status: "active",
      syncedAt: APR_15,
    });

    storage.financial.upsertTransaction({
      externalId: "paycheck-apr",
      accountId: acct.id,
      date: APR_1,
      amount: 7000,
      currency: "USD",
      merchant: "Employer",
      category: "Paycheck",
      categoryGroupType: "income",
      isPending: false,
      isRecurring: true,
      syncedAt: APR_15,
    });

    storage.financial.upsertTransaction({
      externalId: "rent-apr",
      accountId: acct.id,
      date: APR_5,
      amount: -2500,
      currency: "USD",
      merchant: "Landlord",
      category: "Rent",
      categoryGroupType: "expense",
      isPending: false,
      isRecurring: true,
      syncedAt: APR_15,
    });

    storage.financial.upsertTransaction({
      externalId: "transfer-apr",
      accountId: acct.id,
      date: APR_5,
      amount: 1500,
      currency: "USD",
      merchant: "Ally",
      category: "Transfer",
      categoryGroupType: "transfer",
      isPending: false,
      isRecurring: false,
      syncedAt: APR_15,
    });

    const fromMs = new Date(2026, 3, 1, 0, 0, 0).getTime();
    const toMs = new Date(2026, 4, 1, 0, 0, 0).getTime() - 1;
    const txns = storage.financial.queryTransactions({ from: fromMs, to: toMs });
    const rollup = buildCalendarMonthRollup(2026, 3, txns); // month 3 = April (zero-based)

    expect(rollup.income).toBeCloseTo(7000);
    expect(rollup.expenses).toBeCloseTo(2500);
    expect(rollup.burn).toBeCloseTo(2500);
    expect(rollup.contributingTxIds).toHaveLength(2);
    expect(rollup.transferTxIds).toHaveLength(1);

    const g5 = rollup.guardsPassed.find((g) => g.guard === "G5");
    expect(g5?.passed).toBe(true);

    // Transfer IDs must never appear in contributingTxIds.
    const transferTxInStore = storage.financial
      .queryTransactions({ from: fromMs, to: toMs })
      .find((t) => t.externalId === "transfer-apr");
    if (transferTxInStore) {
      expect(rollup.contributingTxIds).not.toContain(transferTxInStore.id);
    }
  });
});

// ── MCP tool integration: get_rollup_contributors returns same set ────────────

describe("get_rollup_contributors — contributor set matches rollup", () => {
  let handle: TestStorageHandle | null = null;

  beforeEach(() => {
    handle = createTestStorage();
  });

  afterEach(() => {
    handle?.cleanup();
    handle = null;
  });

  it("contributor IDs from rollup match what get_rollup_contributors would return", async () => {
    const storage = handle!.storage;

    const MAY_10 = Date.UTC(2026, 4, 10, 12, 0, 0);
    const MAY_15 = Date.UTC(2026, 4, 15, 12, 0, 0);

    const acct = storage.financial.createAccount({
      externalId: "ext-2",
      displayName: "Checking",
      type: "checking",
      balance: 5000,
      currency: "USD",
      status: "active",
      syncedAt: MAY_15,
    });

    storage.financial.upsertTransaction({
      externalId: "pay-may",
      accountId: acct.id,
      date: MAY_10,
      amount: 5000,
      currency: "USD",
      merchant: "Employer",
      category: "Paycheck",
      categoryGroupType: "income",
      isPending: false,
      isRecurring: true,
      syncedAt: MAY_15,
    });

    storage.financial.upsertTransaction({
      externalId: "cc-payment",
      accountId: acct.id,
      date: MAY_10,
      amount: -800,
      currency: "USD",
      merchant: "Chase",
      category: "Credit Card Payment",
      // categoryGroupType intentionally absent — category name fallback
      isPending: false,
      isRecurring: false,
      syncedAt: MAY_15,
    });

    const fromMs = new Date(2026, 4, 1, 0, 0, 0).getTime();
    const toMs = new Date(2026, 5, 1, 0, 0, 0).getTime() - 1;
    const allTxns = storage.financial.queryTransactions({ from: fromMs, to: toMs });

    // Build rollup — this is what financial_monthly_rollup tool does.
    const rollup = buildMonthlyRollup({
      transactions: allTxns,
      period: "2026-05",
      windowType: "calendar_month",
      fromMs,
      toMs,
    });

    // Simulate what get_rollup_contributors does: query same date range,
    // separate transfers from contributors.
    const contributors = allTxns.filter((t) => !isTransferTxn(t));
    const contributorIds = new Set(contributors.map((t) => t.id));

    // The rollup's contributingTxIds must exactly match the IDs returned
    // by the contributors drill-down.
    expect(new Set(rollup.contributingTxIds)).toEqual(contributorIds);

    // The credit-card payment must NOT be in contributors (transfer exclusion).
    const ccTx = allTxns.find((t) => t.externalId === "cc-payment");
    if (ccTx) {
      expect(rollup.contributingTxIds).not.toContain(ccTx.id);
      expect(contributorIds).not.toContain(ccTx.id);
    }
  });
});

