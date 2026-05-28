import type { Storage } from "../../storage/index.js";

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
 *  - net_worth         (assets − liabilities), unit USD
 *  - total_debt        sum of liability balances (abs), unit USD
 *  - liquid_savings    sum of checking + savings balances, unit USD
 *  - portfolio_value   latest holdings snapshot market value, unit USD
 *  - monthly_burn      abs sum of expense txns over the last 30 days, unit USD
 *  - savings_rate      (income − expenses) / income × 100 over last 30 days, unit %
 */
const LIABILITY_TYPES = new Set<string>(["debt", "credit_card"]);
const LIQUID_ASSET_TYPES = new Set<string>(["checking", "savings"]);
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Category names (case-insensitive substring match) treated as transfers when
 * Monarch did not return a `categoryGroup.type`. Older synced rows have
 * `categoryGroupType = null`; this fallback keeps the burn figure honest until
 * the next sync repopulates the column.
 */
const TRANSFER_CATEGORY_NAME_PATTERNS = [
  "transfer",
  "credit card payment",
  "loan payment",
  "balance adjustment",
];

const isTransferTxn = (t: {
  categoryGroupType?: string;
  category?: string;
}): boolean => {
  if (t.categoryGroupType) return t.categoryGroupType.toLowerCase() === "transfer";
  if (!t.category) return false;
  const cat = t.category.toLowerCase();
  return TRANSFER_CATEGORY_NAME_PATTERNS.some((p) => cat.includes(p));
};

const startOfTodayMs = (): number => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
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
  let totalAssets = 0;
  let totalLiabilities = 0;
  let liquidSavings = 0;
  for (const a of accounts) {
    if (LIABILITY_TYPES.has(a.type)) totalLiabilities += Math.abs(a.balance);
    else totalAssets += a.balance;
    if (LIQUID_ASSET_TYPES.has(a.type)) liquidSavings += a.balance;
  }
  const netWorth = totalAssets - totalLiabilities;

  // Latest holdings snapshot only (sync appends a dated snapshot each run).
  const allHoldings = storage.financial.queryHoldings();
  const latestHoldingDate = allHoldings.reduce((m, h) => Math.max(m, h.snapshotDate), 0);
  const portfolioValue = allHoldings
    .filter((h) => h.snapshotDate === latestHoldingDate)
    .reduce((s, h) => s + (h.marketValue ?? 0), 0);

  // Last-30-day spend / income from transactions. Convention: positive = inflow,
  // negative = outflow (matches the finances.tsx sign treatment).
  const since = Date.now() - THIRTY_DAYS_MS;
  const recentTxns = storage.financial.queryTransactions({ from: since });
  let income = 0;
  let expenses = 0;
  for (const t of recentTxns) {
    // Transfers between owned accounts (Ally ↔ joint, credit-card payments,
    // loan principal) aren't spending — counting them was inflating monthly
    // burn by the size of cash movements between accounts.
    if (isTransferTxn(t)) continue;
    if (t.amount > 0) income += t.amount;
    else if (t.amount < 0) expenses += Math.abs(t.amount);
  }
  const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0;

  const metrics: Array<{ metric: string; value: number; unit: string }> = [
    { metric: "net_worth", value: netWorth, unit: "USD" },
    { metric: "total_debt", value: totalLiabilities, unit: "USD" },
    { metric: "liquid_savings", value: liquidSavings, unit: "USD" },
    { metric: "portfolio_value", value: portfolioValue, unit: "USD" },
    { metric: "monthly_burn", value: expenses, unit: "USD" },
    { metric: "savings_rate", value: savingsRate, unit: "%" },
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
