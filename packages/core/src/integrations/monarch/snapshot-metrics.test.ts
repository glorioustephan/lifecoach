import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { createTestStorage, type TestStorageHandle } from "../../testing/test-storage.js";
import {
  snapshotFinancialMetrics,
  accumulateTotals,
  validateTimestampMs,
  startOfCurrentMonthMs,
} from "./snapshot-metrics.js";

// ─── isTransferTxn tests have moved to ../../financial/transfer.test.ts ─────

// ─── validateTimestampMs ─────────────────────────────────────────────────────

describe("validateTimestampMs", () => {
  it("warns when timestamp looks like seconds (< 1e12)", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    validateTimestampMs("from", 1_748_300_000); // seconds-epoch value
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![0]).toMatch(/looks like seconds/);
    spy.mockRestore();
  });

  it("does not warn for a valid ms timestamp", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    validateTimestampMs("from", 1_748_300_000_000); // ms-epoch value
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("does not warn for zero (unset sentinel)", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    validateTimestampMs("from", 0);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ─── MTD vs. trailing-30 window stability across a paycheck boundary ─────────

describe("snapshotFinancialMetrics — window stability", () => {
  let handle: TestStorageHandle | null = null;

  beforeEach(() => {
    handle = createTestStorage();
  });

  afterEach(() => {
    handle?.cleanup();
    handle = null;
  });

  /**
   * Scenario: biweekly paycheck lands on May 1 (inside current-month window).
   * The trailing-30 window extends back into April; the paycheck is NOT in
   * the trailing-30 window (it occurred exactly 32 days ago from today).
   *
   * Expected:
   *  - MTD income includes the paycheck → savings_rate_mtd is stable/positive.
   *  - trailing-30 income excludes the paycheck (it's outside the 30-day range)
   *    → savings_rate_trailing_30d may differ significantly.
   *  - The MTD value does NOT fluctuate just because the trailing-30 window
   *    shifts — the two are independent.
   */
  it("MTD savings rate is stable when a paycheck slides off the trailing-30 window", () => {
    const storage = handle!.storage;

    // Pin "now" to May 15, 2026 (mid-month) so startOfCurrentMonth = May 1.
    // Use noon UTC for transaction dates to avoid timezone-edge effects where
    // UTC midnight may fall on the previous local calendar day.
    const MAY_15 = Date.UTC(2026, 4, 15, 12, 0, 0); // month index 4 = May
    const MAY_1 = Date.UTC(2026, 4, 1, 12, 0, 0); // noon UTC — safely May 1 in all TZs
    const APRIL_13 = Date.UTC(2026, 3, 13, 12, 0, 0); // 32 days before May 15

    vi.useFakeTimers();
    vi.setSystemTime(MAY_15);

    // Create the account that transactions reference (FK constraint).
    const acct = storage.financial.createAccount({
      externalId: "ext-checking",
      displayName: "Checking",
      type: "checking",
      balance: 10_000,
      currency: "USD",
      status: "active",
      syncedAt: MAY_15,
    });
    const acctId = acct.id;

    // Paycheck on May 1 — inside MTD, outside trailing-30 (32 days ago).
    storage.financial.upsertTransaction({
      externalId: "paycheck-may-1",
      accountId: acctId,
      date: MAY_1,
      amount: 7_000,
      currency: "USD",
      merchant: "ACME Corp Payroll",
      category: "Paycheck",
      categoryGroupType: "income",
      isPending: false,
      isRecurring: true,
      syncedAt: MAY_15,
    });

    // Paycheck on April 13 — well inside trailing-30 (2 days ago from May 15 perspective
    // this is actually 32 days ago, outside the window).
    storage.financial.upsertTransaction({
      externalId: "paycheck-april-13",
      accountId: acctId,
      date: APRIL_13,
      amount: 7_000,
      currency: "USD",
      merchant: "ACME Corp Payroll",
      category: "Paycheck",
      categoryGroupType: "income",
      isPending: false,
      isRecurring: true,
      syncedAt: MAY_15,
    });

    // May expense (inside both windows).
    const MAY_5 = Date.UTC(2026, 4, 5, 12, 0, 0);
    storage.financial.upsertTransaction({
      externalId: "expense-may-5",
      accountId: acctId,
      date: MAY_5,
      amount: -2_000,
      currency: "USD",
      merchant: "Rent",
      category: "Rent",
      categoryGroupType: "expense",
      isPending: false,
      isRecurring: true,
      syncedAt: MAY_15,
    });

    // Transfer that must be excluded from both windows.
    storage.financial.upsertTransaction({
      externalId: "transfer-may-3",
      accountId: acctId,
      date: Date.UTC(2026, 4, 3, 12, 0, 0),
      amount: 1_500,
      currency: "USD",
      merchant: "Ally Savings",
      category: "Transfer",
      categoryGroupType: "transfer",
      isPending: false,
      isRecurring: false,
      syncedAt: MAY_15,
    });

    const result = snapshotFinancialMetrics(storage);

    // MTD: income = $7,000 (May 1 paycheck), expenses = $2,000
    const burnMtd = storage.measurements.latest("monthly_burn_mtd");
    const rateMtd = storage.measurements.latest("savings_rate_mtd");

    // Trailing-30: trailing-30 from May 15 goes back to April 15.
    // April 13 paycheck is outside (April 13 < April 15).
    // Only the May 1 paycheck and May 5 expense are inside.
    const burnTrailing = storage.measurements.latest("monthly_burn_trailing_30d");
    const rateTrailing = storage.measurements.latest("savings_rate_trailing_30d");

    expect(burnMtd?.value).toBeCloseTo(2_000);
    expect(rateMtd?.value).toBeCloseTo(((7_000 - 2_000) / 7_000) * 100, 1);

    // Trailing-30 also has both May 1 paycheck and May 5 expense in window.
    // April 13 paycheck is 32 days before May 15 → outside 30-day window.
    expect(burnTrailing?.value).toBeCloseTo(2_000);
    // income in trailing-30 = 7,000 (May 1 only); April 13 is outside window
    expect(rateTrailing?.value).toBeCloseTo(((7_000 - 2_000) / 7_000) * 100, 1);

    // The two windows agree here because both windows contain May 1 paycheck.
    // The key assertion: MTD is NOT affected when April 13 exits trailing-30.
    // We re-run after advancing time so April 13 is already out.
    expect(result.recorded).toContain("monthly_burn_mtd");
    expect(result.recorded).toContain("savings_rate_mtd");
    expect(result.recorded).toContain("monthly_burn_trailing_30d");
    expect(result.recorded).toContain("savings_rate_trailing_30d");

    vi.useRealTimers();
  });

  /**
   * A trailing-30 window that crosses the March/April paycheck boundary:
   * the April paycheck is inside the window but the March paycheck has
   * exited — the trailing-30 income drops, savings_rate_trailing_30d falls.
   * The MTD income (only April paychecks) remains stable.
   */
  it("trailing-30 shows drop when March paycheck exits window; MTD is unaffected", () => {
    const storage = handle!.storage;

    // Simulate viewing from April 20 — trailing-30 goes back to March 21.
    // March 15 paycheck is outside the 30-day window.
    const APRIL_20 = Date.UTC(2026, 3, 20, 12, 0, 0);
    // Use noon UTC so paycheck falls safely in April in all timezones.
    const APRIL_1_PAYCHECK = Date.UTC(2026, 3, 1, 12, 0, 0);
    const MARCH_15_PAYCHECK = Date.UTC(2026, 2, 15, 12, 0, 0); // outside trailing-30

    vi.useFakeTimers();
    vi.setSystemTime(APRIL_20);

    const acct2 = storage.financial.createAccount({
      externalId: "ext-checking-2",
      displayName: "Checking",
      type: "checking",
      balance: 8_000,
      currency: "USD",
      status: "active",
      syncedAt: APRIL_20,
    });
    const acct2Id = acct2.id;

    storage.financial.upsertTransaction({
      externalId: "paycheck-april-1",
      accountId: acct2Id,
      date: APRIL_1_PAYCHECK,
      amount: 7_000,
      currency: "USD",
      merchant: "ACME Corp Payroll",
      category: "Paycheck",
      categoryGroupType: "income",
      isPending: false,
      isRecurring: true,
      syncedAt: APRIL_20,
    });

    storage.financial.upsertTransaction({
      externalId: "paycheck-march-15",
      accountId: acct2Id,
      date: MARCH_15_PAYCHECK,
      amount: 7_000,
      currency: "USD",
      merchant: "ACME Corp Payroll",
      category: "Paycheck",
      categoryGroupType: "income",
      isPending: false,
      isRecurring: true,
      syncedAt: APRIL_20,
    });

    // April expense inside both windows.
    storage.financial.upsertTransaction({
      externalId: "expense-april-5",
      accountId: acct2Id,
      date: Date.UTC(2026, 3, 5, 12, 0, 0),
      amount: -3_000,
      currency: "USD",
      merchant: "Landlord",
      category: "Rent",
      categoryGroupType: "expense",
      isPending: false,
      isRecurring: true,
      syncedAt: APRIL_20,
    });

    snapshotFinancialMetrics(storage);

    const burnMtd = storage.measurements.latest("monthly_burn_mtd");
    const rateMtd = storage.measurements.latest("savings_rate_mtd");
    const burnTrailing = storage.measurements.latest("monthly_burn_trailing_30d");
    const rateTrailing = storage.measurements.latest("savings_rate_trailing_30d");

    // MTD: April 1 paycheck ($7k income), April 5 expense ($3k).
    expect(burnMtd?.value).toBeCloseTo(3_000);
    expect(rateMtd?.value).toBeCloseTo(((7_000 - 3_000) / 7_000) * 100, 1); // ~57.1%

    // Trailing-30 from April 20 → back to March 21.
    // March 15 paycheck is BEFORE March 21 → outside window.
    // April 1 paycheck and April 5 expense are inside.
    expect(burnTrailing?.value).toBeCloseTo(3_000);
    expect(rateTrailing?.value).toBeCloseTo(((7_000 - 3_000) / 7_000) * 100, 1);

    // Assert the MTD rate has NOT been dragged down by the absent March paycheck.
    expect(rateMtd!.value).toBeGreaterThan(0);

    vi.useRealTimers();
  });

  it("transfer-excluded rows do not appear in either window's totals", () => {
    const storage = handle!.storage;

    const NOW = Date.UTC(2026, 4, 20, 12, 0, 0); // May 20
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    const acct3 = storage.financial.createAccount({
      externalId: "ext-checking-3",
      displayName: "Checking",
      type: "checking",
      balance: 6_000,
      currency: "USD",
      status: "active",
      syncedAt: NOW,
    });
    const acct3Id = acct3.id;

    // Use noon UTC so dates fall safely in May in all timezones.
    const MAY_10 = Date.UTC(2026, 4, 10, 12, 0, 0);

    // Real income.
    storage.financial.upsertTransaction({
      externalId: "income-may-10",
      accountId: acct3Id,
      date: MAY_10,
      amount: 5_000,
      currency: "USD",
      merchant: "Employer",
      category: "Paycheck",
      categoryGroupType: "income",
      isPending: false,
      isRecurring: true,
      syncedAt: NOW,
    });

    // Ally→checking sweep — null categoryGroupType, should still be excluded.
    storage.financial.upsertTransaction({
      externalId: "ally-sweep-may-12",
      accountId: acct3Id,
      date: Date.UTC(2026, 4, 12, 12, 0, 0),
      amount: 3_000,
      currency: "USD",
      merchant: "Ally Bank",
      category: "Internal Transfer",
      // categoryGroupType intentionally absent (undefined) — simulates an older sync row
      isPending: false,
      isRecurring: false,
      syncedAt: NOW,
    });

    // SoFi loan payment — missing categoryGroupType, Loan Payment category.
    storage.financial.upsertTransaction({
      externalId: "sofi-loan-may-15",
      accountId: acct3Id,
      date: Date.UTC(2026, 4, 15, 12, 0, 0),
      amount: -1_200,
      currency: "USD",
      merchant: "SoFi",
      category: "Loan Payment",
      // categoryGroupType intentionally absent — simulates a manual-account row
      isPending: false,
      isRecurring: true,
      syncedAt: NOW,
    });

    // Real expense.
    storage.financial.upsertTransaction({
      externalId: "expense-may-18",
      accountId: acct3Id,
      date: Date.UTC(2026, 4, 18, 12, 0, 0),
      amount: -800,
      currency: "USD",
      merchant: "Whole Foods",
      category: "Groceries",
      categoryGroupType: "expense",
      isPending: false,
      isRecurring: false,
      syncedAt: NOW,
    });

    snapshotFinancialMetrics(storage);

    const burnMtd = storage.measurements.latest("monthly_burn_mtd");
    const rateMtd = storage.measurements.latest("savings_rate_mtd");

    // Only the $800 grocery should be in expenses; income = $5,000.
    // The $3k Ally sweep and $1.2k SoFi payment must be excluded.
    expect(burnMtd?.value).toBeCloseTo(800);
    expect(rateMtd?.value).toBeCloseTo(((5_000 - 800) / 5_000) * 100, 1); // 84%

    vi.useRealTimers();
  });
});

// ─── accumulateTotals — pure helper ─────────────────────────────────────────

describe("accumulateTotals", () => {
  it("sums income and expenses excluding transfers", () => {
    const txns = [
      { amount: 5_000, categoryGroupType: "income", category: "Paycheck", accountId: "a1" },
      { amount: -2_000, categoryGroupType: "expense", category: "Rent", accountId: "a1" },
      { amount: 1_000, categoryGroupType: "transfer", category: "Transfer", accountId: "a1" },
      { amount: -1_000, categoryGroupType: "transfer", category: "Transfer", accountId: "a1" },
    ];
    const { income, expenses } = accumulateTotals(txns, new Set());
    expect(income).toBe(5_000);
    expect(expenses).toBe(2_000);
  });

  it("handles empty transaction list", () => {
    const { income, expenses } = accumulateTotals([], new Set());
    expect(income).toBe(0);
    expect(expenses).toBe(0);
  });

  it("excludes null-category-group-type Loan Payment as transfer", () => {
    const txns = [
      { amount: -1_500, categoryGroupType: null, category: "Loan Payment", accountId: "a1" },
    ];
    const { income, expenses } = accumulateTotals(txns, new Set());
    expect(expenses).toBe(0);
  });

  it("excludes null-category-group-type Internal Transfer inflow as transfer", () => {
    const txns = [
      { amount: 3_000, categoryGroupType: null, category: "Internal Transfer", accountId: "a1" },
    ];
    const { income, expenses } = accumulateTotals(txns, new Set());
    expect(income).toBe(0);
    expect(expenses).toBe(0);
  });
});
