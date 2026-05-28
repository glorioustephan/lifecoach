/**
 * Monthly financial rollup computation — canonical implementation of the
 * savings-rate-insight-quality brief's formulas (Section 1) and G1–G6
 * emission guards (Section 4).
 *
 * This module is the single authoritative source for:
 *  - Transfer exclusion (delegates to isTransferTxn from ./transfer.ts)
 *  - Income / expense / burn / savings_rate formulas
 *  - contributing_tx_ids[] for every aggregate (G5 itemization contract)
 *  - Guard evaluation (G1–G6)
 *
 * Nothing outside this module should reimplement these formulas.
 */

import { isTransferTxn } from "./transfer.js";
import type { Transaction } from "@lifecoach/schemas";

// ── Types ────────────────────────────────────────────────────────────────────

export type GuardId = "G1" | "G2" | "G3" | "G4" | "G5" | "G6";

export interface GuardResult {
  guard: GuardId;
  passed: boolean;
  detail: string;
}

export type WindowType = "calendar_month" | "mtd" | "trailing_30" | "trailing_90";

/**
 * The canonical MonthlyRollup shape. Every aggregate the agent cites must be
 * backed by this structure or derived from it. The `contributing_tx_ids` field
 * is the G5 itemization contract — callers can drill down to the raw rows.
 */
export interface MonthlyRollup {
  /** e.g. "2026-03" or "2026-05-MTD" */
  period: string;
  windowType: WindowType;
  daysInWindow: number;
  /** Transfer-excluded income total (sum of positive amounts). */
  income: number;
  /** Transfer-excluded expense total (sum of absolute negative amounts). */
  expenses: number;
  /** == expenses (canonical definition: burn is expenses only). */
  burn: number;
  /** (income - expenses) / income × 100; NaN if income === 0. */
  savingsRate: number;
  /** Total of excluded transfer amounts (both legs). Surfaced for G2 check. */
  transferTotal: number;
  /** transferTotal / (income + transferTotal); 0 if denominator is 0. */
  transferRatio: number;
  /** IDs of all contributing (non-transfer) transactions. G5 contract. */
  contributingTxIds: string[];
  /** IDs of all transfer transactions (excluded from totals). */
  transferTxIds: string[];
  guardsPassed: GuardResult[];
  /** true if any single month in the comparison window had expenses > 1.5× 6-month median. */
  outlierMonthDetected: boolean;
}

// ── Category-subtotal shape ──────────────────────────────────────────────────

export interface CategorySubtotal {
  category: string;
  total: number;
  txIds: string[];
}

// ── Internal helpers ─────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const daysInWindow = (fromMs: number, toMs: number): number =>
  Math.max(1, Math.round((toMs - fromMs) / MS_PER_DAY));

const monthKey = (year: number, monthZeroBased: number): string =>
  `${year}-${String(monthZeroBased + 1).padStart(2, "0")}`;

// ── Core rollup computation ──────────────────────────────────────────────────

/**
 * Evaluate the G1–G6 guards for a given rollup result. Separated out so tests
 * can call it independently.
 */
export const evaluateGuards = (
  windowType: WindowType,
  daysCount: number,
  income: number,
  transferTotal: number,
  transferRatio: number,
  contributingTxIds: string[],
  outlierMonthDetected: boolean,
): GuardResult[] => {
  const results: GuardResult[] = [];

  // G1 — Data completeness (>= 15 days of data for MTD).
  const g1Passed =
    windowType === "mtd" || windowType === "calendar_month"
      ? daysCount >= 15
      : true; // trailing windows are not subject to this guard
  results.push({
    guard: "G1",
    passed: g1Passed,
    detail: g1Passed
      ? `Window has ${daysCount} days (>= 15)`
      : `Window has only ${daysCount} days (need >= 15 for MTD)`,
  });

  // G2 — Transfer ratio < 0.20.
  const g2Passed = transferRatio < 0.2;
  results.push({
    guard: "G2",
    passed: g2Passed,
    detail: g2Passed
      ? `Transfer ratio ${(transferRatio * 100).toFixed(1)}% is below 20%`
      : `Transfer ratio ${(transferRatio * 100).toFixed(1)}% exceeds 20% — likely double-counting`,
  });

  // G3 — No outlier month in window.
  results.push({
    guard: "G3",
    passed: !outlierMonthDetected,
    detail: outlierMonthDetected
      ? "Outlier month detected in window (expenses > 1.5× 6-month median)"
      : "No outlier month in window",
  });

  // G4 — Window consistency (single window type per rollup by definition).
  results.push({
    guard: "G4",
    passed: true,
    detail: `Window type is consistently ${windowType}`,
  });

  // G5 — Itemization available.
  const g5Passed = contributingTxIds.length > 0;
  results.push({
    guard: "G5",
    passed: g5Passed,
    detail: g5Passed
      ? `${contributingTxIds.length} contributing transaction(s) available for drill-down`
      : "No contributing transactions found — rollup cannot be cited",
  });

  // G6 — Income > 0.
  const g6Passed = income > 0;
  results.push({
    guard: "G6",
    passed: g6Passed,
    detail: g6Passed
      ? `Income ${income.toFixed(2)} > 0`
      : "Income is 0 after transfer exclusion — savings rate undefined",
  });

  return results;
};

// ── Outlier detection ────────────────────────────────────────────────────────

/**
 * Detect whether any month in the window is an outlier (expenses > 1.5× the
 * 6-month median). The caller supplies per-month expense totals (already
 * transfer-excluded). Returns true if any supplied month exceeds the threshold.
 *
 * When fewer than 2 months are available for comparison, outlier detection
 * cannot be performed and returns false (insufficient baseline).
 */
export const detectOutlierMonths = (monthlyExpenses: number[]): boolean => {
  if (monthlyExpenses.length < 2) return false;
  const sorted = [...monthlyExpenses].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
      : (sorted[mid] ?? 0);
  if (median === 0) return false;
  return monthlyExpenses.some((e) => e > 1.5 * median);
};

// ── Public API ───────────────────────────────────────────────────────────────

export interface BuildRollupInput {
  /**
   * All transactions in the rollup window. The caller is responsible for
   * pre-filtering by date range using `queryTransactions({ from, to })`.
   * Must include full `Transaction` shape (id, amount, category,
   * categoryGroupType) so transfer exclusion can be applied correctly.
   */
  transactions: ReadonlyArray<
    Pick<Transaction, "id" | "amount" | "category" | "categoryGroupType">
  >;
  period: string;
  windowType: WindowType;
  fromMs: number;
  toMs: number;
  /**
   * Optional: per-month expense totals for the last 6 months (transfer-
   * excluded) for G3 outlier detection. If not provided, outlier detection
   * is skipped and outlierMonthDetected returns false.
   */
  historicalMonthlyExpenses?: number[];
}

/**
 * Build a MonthlyRollup from a pre-fetched transaction list.
 *
 * This is a pure function — it does not query storage. The caller fetches
 * transactions with the appropriate date filter and passes them here.
 * This design keeps the function testable without a database.
 */
export const buildMonthlyRollup = (input: BuildRollupInput): MonthlyRollup => {
  const { transactions, period, windowType, fromMs, toMs, historicalMonthlyExpenses } = input;

  let income = 0;
  let expenses = 0;
  let transferTotal = 0;
  const contributingTxIds: string[] = [];
  const transferTxIds: string[] = [];

  for (const t of transactions) {
    if (isTransferTxn(t)) {
      transferTxIds.push(t.id);
      transferTotal += Math.abs(t.amount);
      continue;
    }
    contributingTxIds.push(t.id);
    if (t.amount > 0) income += t.amount;
    else if (t.amount < 0) expenses += Math.abs(t.amount);
  }

  const burn = expenses;
  const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : NaN;
  const transferRatio =
    income + transferTotal > 0 ? transferTotal / (income + transferTotal) : 0;

  const days = daysInWindow(fromMs, toMs);
  const outlierMonthDetected = historicalMonthlyExpenses
    ? detectOutlierMonths(historicalMonthlyExpenses)
    : false;

  const guardsPassed = evaluateGuards(
    windowType,
    days,
    income,
    transferTotal,
    transferRatio,
    contributingTxIds,
    outlierMonthDetected,
  );

  return {
    period,
    windowType,
    daysInWindow: days,
    income,
    expenses,
    burn,
    savingsRate,
    transferTotal,
    transferRatio,
    contributingTxIds,
    transferTxIds,
    guardsPassed,
    outlierMonthDetected,
  };
};

/**
 * Build a rollup for a full calendar month. Convenience wrapper that
 * computes the period key and window bounds.
 */
export const buildCalendarMonthRollup = (
  year: number,
  monthZeroBased: number,
  transactions: BuildRollupInput["transactions"],
  historicalMonthlyExpenses?: number[],
): MonthlyRollup => {
  const fromMs = new Date(year, monthZeroBased, 1, 0, 0, 0).getTime();
  const toMs = new Date(year, monthZeroBased + 1, 1, 0, 0, 0).getTime() - 1;
  return buildMonthlyRollup({
    transactions,
    period: monthKey(year, monthZeroBased),
    windowType: "calendar_month",
    fromMs,
    toMs,
    historicalMonthlyExpenses,
  });
};

/**
 * Build a rollup for the current calendar month to date (MTD).
 */
export const buildMtdRollup = (
  transactions: BuildRollupInput["transactions"],
  nowMs: number = Date.now(),
  historicalMonthlyExpenses?: number[],
): MonthlyRollup => {
  const now = new Date(nowMs);
  const fromMs = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0).getTime();
  const year = now.getFullYear();
  const month = now.getMonth();
  return buildMonthlyRollup({
    transactions,
    period: `${monthKey(year, month)}-MTD`,
    windowType: "mtd",
    fromMs,
    toMs: nowMs,
    historicalMonthlyExpenses,
  });
};

/**
 * Compute per-category expense subtotals from a set of transactions, with
 * transfer exclusion applied. Returns an array sorted by total descending.
 * Each entry carries the contributing txIds for that category.
 */
export const buildCategorySubtotals = (
  transactions: ReadonlyArray<
    Pick<Transaction, "id" | "amount" | "category" | "categoryGroupType">
  >,
): CategorySubtotal[] => {
  const map = new Map<string, { total: number; txIds: string[] }>();
  for (const t of transactions) {
    if (isTransferTxn(t)) continue;
    if (t.amount >= 0) continue; // expenses only
    const cat = t.category ?? "uncategorized";
    const entry = map.get(cat) ?? { total: 0, txIds: [] };
    entry.total += Math.abs(t.amount);
    entry.txIds.push(t.id);
    map.set(cat, entry);
  }
  return Array.from(map.entries())
    .map(([category, v]) => ({ category, total: v.total, txIds: v.txIds }))
    .sort((a, b) => b.total - a.total);
};
