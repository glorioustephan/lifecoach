import type { Storage } from "../../storage/index.js";
import { isTransferTxn } from "../../financial/transfer.js";
import { computeNetWorth } from "../../financial/portfolio.js";
import { assertEpochMs } from "../../agent/tools/epoch-input.js";

/**
 * Snapshot a small set of derived financial metrics into the generic
 * `measurements` table so the unified Insighter / reflector can cite financial
 * trends (delta, rolling avg) with the same machinery used for weight/sleep —
 * see {@link MeasurementRepository.latest}/`.summarize`.
 *
 * Called at the end of `syncMonarch` once accounts/transactions/holdings are
 * up to date. Idempotent per day: a metric is skipped if one is already
 * recorded for today (we run on a daily cron).
 *
 * Metrics emitted:
 *  - net_worth              (assets − liabilities), unit USD
 *  - total_debt             sum of liability balances (abs), unit USD
 *  - liquid_savings         sum of checking + savings balances, unit USD
 *  - portfolio_value        latest holdings snapshot market value, unit USD
 *  - monthly_burn_mtd       abs sum of expense txns since start of current
 *                           calendar month, unit USD/mtd
 *  - monthly_burn_trailing_30d  abs sum of expense txns over trailing 30 days
 *                           anchored to Date.now(), unit USD/trailing30d
 *  - savings_rate_mtd       (income − expenses) / income × 100 over current
 *                           calendar-month-to-date, unit %/mtd
 *  - savings_rate_trailing_30d  same formula over trailing 30 days,
 *                           unit %/trailing30d
 *
 * Historical aliases (kept for backward-compat consumers that read the old key
 * names): `monthly_burn` and `savings_rate` are written with the MTD value and
 * MTD units so downstream prompts that haven't been updated yet always receive
 * the calendar-month figure rather than the rolling window.
 */
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Returns the Unix-ms timestamp for the first instant of the current calendar
 * month in local time.
 */
const startOfCurrentMonthMs = (): number => {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const startOfTodayMs = (): number => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Accumulate income/expense totals from a transaction list, excluding transfers. */
const accumulateTotals = (
  txns: ReadonlyArray<{
    amount: number;
    categoryGroupType?: string | null | undefined;
    category?: string | null | undefined;
    accountId?: string | null | undefined;
  }>,
  internalAccountIds: ReadonlySet<string>,
): { income: number; expenses: number } => {
  let income = 0;
  let expenses = 0;
  for (const t of txns) {
    if (isTransferTxn(t, internalAccountIds)) continue;
    if (t.amount > 0) income += t.amount;
    else if (t.amount < 0) expenses += Math.abs(t.amount);
  }
  return { income, expenses };
};

export interface SnapshotResult {
  /** Metric names actually written this run (skipped if already recorded today). */
  recorded: string[];
}

export const snapshotFinancialMetrics = (storage: Storage): SnapshotResult => {
  const recordedAt = startOfTodayMs();
  const today = recordedAt;

  // Compute from currently-synced local state.
  const accounts = storage.financial.listAccounts({ status: "active" });

  // Build the internal-accounts set for transfer cross-referencing (account-pair rule).
  // All accounts in the user's own Monarch workspace are considered internal.
  // The external_id stored on each account row is the Monarch account ID; transactions
  // carry accountId which maps to the internal UUID.  We therefore collect both
  // the internal UUID and the externalId to maximise hit rate.
  const internalAccountIds = new Set<string>(accounts.flatMap((a) => [a.id, a.externalId]));

  const { totalAssets, totalLiabilities, netWorth, liquidSavings } = computeNetWorth(accounts);

  // Latest holdings snapshot only (sync appends a dated snapshot each run).
  const allHoldings = storage.financial.queryHoldings();
  const latestHoldingDate = allHoldings.reduce((m, h) => Math.max(m, h.snapshotDate), 0);
  const portfolioValue = allHoldings
    .filter((h) => h.snapshotDate === latestHoldingDate)
    .reduce((s, h) => s + (h.marketValue ?? 0), 0);

  // ── Calendar-month-to-date window ────────────────────────────────────────
  // Anchored to midnight on the 1st of the current month. This is the figure
  // users see in their budgeting view and intuitively understand as "this month".
  const mtdFrom = startOfCurrentMonthMs();
  assertEpochMs("mtdFrom", mtdFrom);
  const mtdTxns = storage.financial.queryTransactions({ from: mtdFrom });
  const { income: incomeMtd, expenses: expensesMtd } = accumulateTotals(
    mtdTxns,
    internalAccountIds,
  );
  const savingsRateMtd = incomeMtd > 0 ? ((incomeMtd - expensesMtd) / incomeMtd) * 100 : 0;

  // ── Trailing-30-day window ────────────────────────────────────────────────
  // Anchored to Date.now(). Useful for smoothed trend analysis but MUST NOT be
  // narrated as a "monthly" figure — paycheck timing at month boundaries causes
  // discontinuous jumps that are windowing artifacts, not behavioral changes.
  const trailing30From = Date.now() - THIRTY_DAYS_MS;
  assertEpochMs("trailing30From", trailing30From);
  const trailing30Txns = storage.financial.queryTransactions({ from: trailing30From });
  const { income: incomeTrailing30, expenses: expensesTrailing30 } = accumulateTotals(
    trailing30Txns,
    internalAccountIds,
  );
  const savingsRateTrailing30 =
    incomeTrailing30 > 0 ? ((incomeTrailing30 - expensesTrailing30) / incomeTrailing30) * 100 : 0;

  const metrics: Array<{ metric: string; value: number; unit: string }> = [
    { metric: "net_worth", value: netWorth, unit: "USD" },
    { metric: "total_debt", value: totalLiabilities, unit: "USD" },
    { metric: "liquid_savings", value: liquidSavings, unit: "USD" },
    { metric: "portfolio_value", value: portfolioValue, unit: "USD" },

    // Primary MTD metrics (calendar-month intuition).
    { metric: "monthly_burn_mtd", value: expensesMtd, unit: "USD/mtd" },
    { metric: "savings_rate_mtd", value: savingsRateMtd, unit: "%/mtd" },

    // Trailing-30 metrics (trend/smoothing use case only).
    {
      metric: "monthly_burn_trailing_30d",
      value: expensesTrailing30,
      unit: "USD/trailing30d",
    },
    {
      metric: "savings_rate_trailing_30d",
      value: savingsRateTrailing30,
      unit: "%/trailing30d",
    },

    // Backward-compat aliases — write the MTD value so any prompt that reads
    // these legacy keys gets the calendar-month figure.  These will be removed
    // once all consumers migrate to the explicit *_mtd / *_trailing_30d keys.
    { metric: "monthly_burn", value: expensesMtd, unit: "USD/mtd" },
    { metric: "savings_rate", value: savingsRateMtd, unit: "%/mtd" },
  ];

  const recorded: string[] = [];
  for (const m of metrics) {
    const latest = storage.measurements.latest(m.metric);
    // Skip if we've already recorded this metric today (idempotent per day).
    if (latest && latest.recordedAt >= today) continue;
    storage.measurements.create({
      metric: m.metric,
      value: m.value,
      unit: m.unit,
      recordedAt,
    });
    recorded.push(m.metric);
  }
  return { recorded };
};

// ─── Pure helpers exported for unit tests ───────────────────────────────────

export { accumulateTotals, startOfCurrentMonthMs };
