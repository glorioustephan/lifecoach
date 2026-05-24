import { z } from "zod";
import type { ArtifactPlugin } from "../index.js";

export const cashflowSummaryPayloadSchema = z.object({
  period: z.string().describe("Time period covered (e.g., 'May 2026', 'Q2 2026')"),
  total_inflows: z.number().describe("Total income and deposits in period"),
  total_outflows: z.number().describe("Total spending and withdrawals in period"),
  net: z.number().describe("Inflows minus outflows"),
  savings_rate: z.number().describe("Savings rate as percentage (net / inflows * 100)"),
  runway_months: z.number().describe("Months of expenses covered by emergency fund / savings"),
});

export type CashflowSummaryPayload = z.infer<typeof cashflowSummaryPayloadSchema>;

export const cashflowSummaryPlugin: ArtifactPlugin = {
  id: "cashflow-summary",
  name: "Cashflow Summary",
  description: "High-level cashflow overview with savings rate and financial runway.",
  badgeColor: "success",
  keywords: ["cashflow", "savings", "spending", "income", "runway", "emergency fund"],
  detectionPrompt: `Look for discussions of overall spending patterns, savings rate, financial runway, or income vs. expenses. The user might say "I'm saving 25% this month" or "I'm worried about my emergency fund" or ask "How much am I saving?" Flag when they're thinking about their overall financial position, not just individual transactions.`,
  payloadSchema: {
    type: "object",
    properties: {
      period: {
        type: "string",
        description: "Time period covered",
      },
      total_inflows: {
        type: "number",
        description: "Total income and deposits",
      },
      total_outflows: {
        type: "number",
        description: "Total spending and withdrawals",
      },
      net: {
        type: "number",
        description: "Net (inflows - outflows)",
      },
      savings_rate: {
        type: "number",
        description: "Savings rate as percentage",
      },
      runway_months: {
        type: "number",
        description: "Months of expenses covered by savings",
      },
    },
    required: ["period", "total_inflows", "total_outflows", "net", "savings_rate", "runway_months"],
  },
};
