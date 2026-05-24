import { z } from "zod";
import { getArtifactDescriptor } from "@lifecoach/schemas";
import type { ArtifactPlugin, FormattedArtifact } from "../types.js";

const cashflowSchema = z.object({
  period: z.string().min(1),
  total_inflows: z.number(),
  total_outflows: z.number(),
  net: z.number(),
  savings_rate: z.number(),
  runway_months: z.number(),
  confidence: z.number().min(0).max(1),
});

type CashflowSummary = z.infer<typeof cashflowSchema>;

const itemSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    period: { type: "string", description: "Time period, e.g. 'May 2026' or 'Q2 2026'." },
    total_inflows: { type: "number", description: "Total income and deposits in the period." },
    total_outflows: { type: "number", description: "Total spending and withdrawals." },
    net: { type: "number", description: "Inflows minus outflows." },
    savings_rate: { type: "number", description: "Savings rate as a percentage, e.g. 26." },
    runway_months: {
      type: "number",
      description: "Months of expenses covered by current savings/emergency fund.",
    },
    confidence: {
      type: "number",
      description: "0–1: confidence this is a genuine cashflow summary with concrete numbers.",
    },
  },
  required: ["period", "total_inflows", "total_outflows", "net", "savings_rate", "runway_months", "confidence"],
};

const format = (data: CashflowSummary): FormattedArtifact => ({
  title: `Cashflow summary — ${data.period}`,
  body: [
    `# Cashflow Summary: ${data.period}`,
    "",
    `**In:** $${data.total_inflows.toFixed(2)} · **Out:** $${data.total_outflows.toFixed(2)} · **Net:** $${data.net.toFixed(2)}`,
    `**Savings rate:** ${data.savings_rate.toFixed(1)}% · **Runway:** ${data.runway_months.toFixed(1)} months`,
  ].join("\n"),
  tags: ["cashflow", "savings", data.period.toLowerCase().replace(/\s+/g, "-")],
  category: "finance",
});

export const cashflowSummaryPlugin: ArtifactPlugin = {
  descriptor: getArtifactDescriptor("cashflow-summary")!,
  collectionKey: "cashflow_summaries",
  itemSchema,
  promptHint:
    "cashflow_summaries: overall income/expense summaries with a savings rate and financial runway. " +
    "Only extract when the user discusses concrete inflow/outflow numbers, not general mentions of saving.",
  extractItem: (input) => {
    const parsed = cashflowSchema.safeParse(input);
    if (!parsed.success) return null;
    return { confidence: parsed.data.confidence, formatted: format(parsed.data) };
  },
};
