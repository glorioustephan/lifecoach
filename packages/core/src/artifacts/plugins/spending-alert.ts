import { z } from "zod";
import { getArtifactDescriptor } from "@lifecoach/schemas";
import type { ArtifactPlugin, FormattedArtifact } from "../types.js";

const spendingAlertSchema = z.object({
  category: z.string().min(1),
  amount_this_month: z.number(),
  average_amount: z.number(),
  variance_percent: z.number(),
  recommendation: z.string(),
  confidence: z.number().min(0).max(1),
});

type SpendingAlert = z.infer<typeof spendingAlertSchema>;

const itemSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    category: { type: "string", description: "Category with increased spending (e.g., 'Dining')." },
    amount_this_month: { type: "number", description: "Total spent in this category this month." },
    average_amount: { type: "number", description: "3-month rolling average for this category." },
    variance_percent: { type: "number", description: "Percentage above average, e.g. 42 for 42%." },
    recommendation: { type: "string", description: "One concrete action to reduce spending." },
    confidence: {
      type: "number",
      description: "0–1: how confident you are this is a genuine spending alert, not a passing mention.",
    },
  },
  required: ["category", "amount_this_month", "average_amount", "variance_percent", "recommendation", "confidence"],
};

const format = (data: SpendingAlert): FormattedArtifact => {
  const over = data.variance_percent > 0 ? `+${data.variance_percent.toFixed(0)}%` : `${data.variance_percent.toFixed(0)}%`;
  return {
    title: `${data.category} spending up ${over}`,
    body: [
      `# ${data.category} Spending Alert`,
      "",
      `Spent **$${data.amount_this_month.toFixed(2)}** this month vs. **$${data.average_amount.toFixed(2)}** average (${over}).`,
      "",
      `💡 ${data.recommendation}`,
    ].join("\n"),
    tags: ["spending", data.category.toLowerCase(), "budget"],
    category: "finance",
  };
};

export const spendingAlertPlugin: ArtifactPlugin = {
  descriptor: getArtifactDescriptor("spending-alert")!,
  collectionKey: "spending_alerts",
  itemSchema,
  promptHint:
    "spending_alerts: category spending that is meaningfully above the user's usual pattern. " +
    "Only flag genuine overages, not routine mentions of spending.",
  extractItem: (input) => {
    const parsed = spendingAlertSchema.safeParse(input);
    if (!parsed.success) return null;
    return { confidence: parsed.data.confidence, formatted: format(parsed.data) };
  },
};
