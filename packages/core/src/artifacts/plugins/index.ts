import { registerArtifactPlugin } from "../index.js";
import { spendingAlertPlugin } from "./spending-alert.js";
import { debtPayoffPlanPlugin } from "./debt-payoff-plan.js";
import { cashflowSummaryPlugin } from "./cashflow-summary.js";
import { portfolioSnapshotPlugin } from "./portfolio-snapshot.js";

export { spendingAlertPlugin, debtPayoffPlanPlugin, cashflowSummaryPlugin, portfolioSnapshotPlugin };
export type { SpendingAlertPayload } from "./spending-alert.js";
export type { DebtPayoffPlanPayload } from "./debt-payoff-plan.js";
export type { CashflowSummaryPayload } from "./cashflow-summary.js";
export type { PortfolioSnapshotPayload } from "./portfolio-snapshot.js";

// Register all financial artifact plugins
export const registerFinancialArtifactPlugins = (): void => {
  registerArtifactPlugin(spendingAlertPlugin);
  registerArtifactPlugin(debtPayoffPlanPlugin);
  registerArtifactPlugin(cashflowSummaryPlugin);
  registerArtifactPlugin(portfolioSnapshotPlugin);
};
