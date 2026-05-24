import { z } from "zod";
import type { ArtifactPlugin } from "../index.js";

export const spendingAlertPayloadSchema = z.object({
  category: z.string().describe("Category with increased spending (e.g., 'Dining', 'Groceries')"),
  amount_this_month: z.number().describe("Total spent in category this month"),
  average_amount: z.number().describe("Average monthly spend in this category (rolling 3-month)"),
  variance_percent: z.number().describe("Percentage increase from average"),
  recommendation: z.string().describe("Actionable recommendation to reduce spending"),
});

export type SpendingAlertPayload = z.infer<typeof spendingAlertPayloadSchema>;

export const spendingAlertPlugin: ArtifactPlugin = {
  id: "spending-alert",
  name: "Spending Alert",
  description:
    "Alerts when category spending exceeds 3-month average by >20%. Includes recommendations to reduce.",
  badgeColor: "warning",
  keywords: ["spending", "budget", "overspend", "too much"],
  detectionPrompt: `Look for mentions of spending increases, budget overages, or concerns about spending in specific categories. The user might mention "I spent way too much on dining" or "Groceries are eating my budget." Flag if the amount is notably higher than their typical pattern.`,
  payloadSchema: {
    type: "object",
    properties: {
      category: {
        type: "string",
        description: "Category with increased spending",
      },
      amount_this_month: {
        type: "number",
        description: "Total spent in category this month",
      },
      average_amount: {
        type: "number",
        description: "Average monthly spend in this category (3-month rolling)",
      },
      variance_percent: {
        type: "number",
        description: "Percentage increase from average",
      },
      recommendation: {
        type: "string",
        description: "Actionable recommendation to reduce spending",
      },
    },
    required: ["category", "amount_this_month", "average_amount", "variance_percent", "recommendation"],
  },
};
