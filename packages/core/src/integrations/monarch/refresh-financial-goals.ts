import type { Storage } from "../../storage/index.js";

/**
 * Bridge between Goals and financial Measurements: when an active goal's
 * `targetMetric` is one of the derived financial metrics that `syncMonarch`
 * snapshots (see `snapshot-metrics.ts`), bump its `currentProgress` to the
 * latest measured value so the user's "emergency fund $6,000 by December"
 * (or "pay off card to $0") goal moves on its own as life happens — no new
 * Goals UI required; the existing Goals page reflects it.
 *
 * Idempotent and side-effect-cheap. Called at end of sync. Failures are
 * non-fatal (the caller logs and continues).
 */

const FINANCIAL_TARGET_METRICS = new Set<string>([
  "net_worth",
  "total_debt",
  "liquid_savings",
  "portfolio_value",
  "monthly_burn",
  "savings_rate",
]);

export interface RefreshFinancialGoalsResult {
  goalsUpdated: number;
  goalIds: string[];
}

export const refreshFinancialGoals = (storage: Storage): RefreshFinancialGoalsResult => {
  const goals = storage.goals.list({ status: "active", limit: 1_000 });
  const goalIds: string[] = [];
  for (const g of goals) {
    if (!g.targetMetric || !FINANCIAL_TARGET_METRICS.has(g.targetMetric)) continue;
    const latest = storage.measurements.latest(g.targetMetric);
    if (!latest) continue;
    if (g.currentProgress === latest.value) continue; // no-op when unchanged
    storage.goals.updateProgress(g.id, { currentProgress: latest.value });
    goalIds.push(g.id);
  }
  return { goalsUpdated: goalIds.length, goalIds };
};
