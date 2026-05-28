import type { Storage } from "../storage/index.js";
import type { SemanticMemory } from "./semantic.js";

/**
 * Index financial NARRATIVES (monthly rollups, "money moments") for semantic
 * recall via Voyage. The coach can then conversationally retrieve historical
 * finances — "how were my finances last spring?", "that month dining spiked",
 * "the time we talked about the cell plan" — without us indexing raw rows.
 *
 * Idempotent: each narrative is keyed by a stable `refId` ("month:YYYY-MM",
 * "insight:<id>"), so re-running on each sync REPLACES the previous embedding
 * for that key (handled by `SemanticMemory.indexFinanceNarrative` →
 * `indexRef` → `deleteForRef` + insert).
 */

const LIABILITY_TYPES = new Set<string>(["debt", "credit_card"]);
const RECURRING_FREQ_TO_MONTHLY: Record<string, number> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  monthly: 1,
  bimonthly: 0.5,
  quarterly: 1 / 3,
  semiannual: 1 / 6,
  annual: 1 / 12,
  yearly: 1 / 12,
};

const monthKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const monthBounds = (year: number, monthZeroBased: number): { start: number; end: number } => ({
  start: new Date(year, monthZeroBased, 1, 0, 0, 0).getTime(),
  end: new Date(year, monthZeroBased + 1, 1, 0, 0, 0).getTime() - 1,
});

const fmt = (n: number): string => {
  // Avoid Intl in core (keep deps lean); just thousands separators + 2 decimals.
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const fixed = abs.toFixed(2);
  const [int, dec] = fixed.split(".");
  return `${sign}$${int!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${dec}`;
};

const monthName = (year: number, m0: number): string =>
  new Date(year, m0, 1).toLocaleString("en-US", { month: "long", year: "numeric" });

interface MonthlyNarrative {
  refId: string;
  text: string;
  sourceUpdatedAt: number;
}

const buildMonthlyNarrative = (
  storage: Storage,
  year: number,
  m0: number,
): MonthlyNarrative | null => {
  const { start, end } = monthBounds(year, m0);
  const mk = monthKey(new Date(year, m0, 1));

  // Transactions in this month, with EFFECTIVE category (overrides applied).
  const txns = storage.financial.queryTransactions({ from: start, to: end });
  // Net-worth start/end from measurement series.
  const nwSeries = storage.measurements.query("net_worth", { from: start - 7 * 86400_000, to: end });
  const debtSeries = storage.measurements.query("total_debt", { from: start, to: end });

  // If nothing happened this month and no measurements landed, skip.
  if (txns.length === 0 && nwSeries.length === 0 && debtSeries.length === 0) return null;

  let income = 0;
  let expenses = 0;
  const catRollup = new Map<string, { total: number; count: number }>();
  const merchantRollup = new Map<string, { total: number; count: number }>();
  const recurringByMerchant = new Map<string, { totalAbs: number; count: number; freq?: string }>();
  const notable: Array<{ merchant: string; amount: number; date: number; category?: string }> = [];

  for (const t of txns) {
    if (t.amount > 0) income += t.amount;
    else if (t.amount < 0) expenses += Math.abs(t.amount);
    const cat = t.category ?? "uncategorized";
    const c = catRollup.get(cat) ?? { total: 0, count: 0 };
    if (t.amount < 0) {
      c.total += Math.abs(t.amount);
      c.count += 1;
      catRollup.set(cat, c);
    }
    if (t.amount < 0) {
      const m = merchantRollup.get(t.merchant) ?? { total: 0, count: 0 };
      m.total += Math.abs(t.amount);
      m.count += 1;
      merchantRollup.set(t.merchant, m);
      if (Math.abs(t.amount) >= 200) {
        notable.push({ merchant: t.merchant, amount: t.amount, date: t.date, category: t.category });
      }
    }
    if (t.isRecurring && t.amount < 0) {
      const r = recurringByMerchant.get(t.merchant) ?? { totalAbs: 0, count: 0 };
      r.totalAbs += Math.abs(t.amount);
      r.count += 1;
      if (!r.freq && t.recurringFrequency) r.freq = t.recurringFrequency.toLowerCase();
      recurringByMerchant.set(t.merchant, r);
    }
  }
  const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0;
  const topCategories = Array.from(catRollup.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 6);

  let monthlyRecurringEstimate = 0;
  for (const [, v] of recurringByMerchant) {
    const freqMul = v.freq ? RECURRING_FREQ_TO_MONTHLY[v.freq] : undefined;
    monthlyRecurringEstimate += freqMul ? (v.totalAbs / v.count) * freqMul : v.totalAbs;
  }

  // Net-worth narrative: first + last observation in window.
  const nwStart = nwSeries[0]?.value;
  const nwEnd = nwSeries[nwSeries.length - 1]?.value;
  const nwDelta = nwStart !== undefined && nwEnd !== undefined ? nwEnd - nwStart : undefined;

  const lines: string[] = [];
  lines.push(`[finance/month] ${mk} (${monthName(year, m0)})`);
  if (nwStart !== undefined && nwEnd !== undefined) {
    lines.push(
      `Net worth: ${fmt(nwStart)} → ${fmt(nwEnd)} (${(nwDelta ?? 0) >= 0 ? "+" : ""}${fmt(nwDelta ?? 0)}).`,
    );
  }
  if (income > 0 || expenses > 0) {
    lines.push(
      `Income: ${fmt(income)} · Expenses: ${fmt(expenses)} · Savings rate: ${savingsRate.toFixed(1)}%.`,
    );
  }
  if (topCategories.length > 0) {
    lines.push(
      "Top categories: " +
        topCategories
          .map(([cat, v]) => `${cat} ${fmt(v.total)} (${v.count} txn${v.count === 1 ? "" : "s"})`)
          .join(" · "),
    );
  }
  if (recurringByMerchant.size > 0) {
    lines.push(
      `Recurring expenses: ~${fmt(monthlyRecurringEstimate)}/mo across ${recurringByMerchant.size} merchant${
        recurringByMerchant.size === 1 ? "" : "s"
      }.`,
    );
  }
  if (notable.length > 0) {
    const top = notable.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 5);
    lines.push(
      "Notable transactions: " +
        top
          .map(
            (n) =>
              `${n.merchant} ${fmt(n.amount)}${n.category ? ` (${n.category})` : ""} on ${new Date(n.date).toISOString().slice(0, 10)}`,
          )
          .join("; "),
    );
  }

  return {
    refId: `month:${mk}`,
    text: lines.join("\n"),
    sourceUpdatedAt: end,
  };
};

export interface IndexFinanceNarrativesResult {
  monthsIndexed: number;
  refIds: string[];
}

/**
 * Re-index narratives for the last `lookbackMonths` months (default 3). Each
 * call REPLACES the embedding for each month-key, so it's safe to run after
 * every daily sync — the current-month narrative tracks the partial period.
 */
export const indexFinanceNarratives = async (
  semantic: SemanticMemory,
  storage: Storage,
  opts: { lookbackMonths?: number } = {},
): Promise<IndexFinanceNarrativesResult> => {
  const lookback = opts.lookbackMonths ?? 3;
  const refIds: string[] = [];
  const now = new Date();
  for (let i = 0; i < lookback; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const narrative = buildMonthlyNarrative(storage, d.getFullYear(), d.getMonth());
    if (!narrative) continue;
    await semantic.indexFinanceNarrative({
      refId: narrative.refId,
      text: narrative.text,
      sourceUpdatedAt: narrative.sourceUpdatedAt,
    });
    refIds.push(narrative.refId);
  }
  return { monthsIndexed: refIds.length, refIds };
};

/**
 * Index a single "money moment" — a significant financial decision or insight
 * rendered as recall-friendly prose. Stable refId `insight:<id>` lets later
 * updates (re-render, dismissal note) replace the previous embedding.
 */
export const indexMoneyMomentFromInsight = async (
  semantic: SemanticMemory,
  insight: { id: string; topic: string; body: string; rationale?: string; createdAt: number },
): Promise<void> => {
  const text = [
    `[finance/moment] ${new Date(insight.createdAt).toISOString().slice(0, 10)} — ${insight.topic}`,
    insight.body,
    insight.rationale ? `(why now: ${insight.rationale})` : "",
  ]
    .filter(Boolean)
    .join("\n");
  await semantic.indexFinanceNarrative({
    refId: `insight:${insight.id}`,
    text,
    sourceUpdatedAt: insight.createdAt,
  });
};
