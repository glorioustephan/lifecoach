import { z } from "zod";
import type { ArtifactPlugin } from "../index.js";

export const debtPayoffPlanPayloadSchema = z.object({
  debt_type: z.string().describe("Type of debt (e.g., 'Credit Card', 'Student Loan', 'Car Loan')"),
  current_balance: z.number().describe("Current outstanding balance"),
  interest_rate: z.number().describe("Annual interest rate (as percentage, e.g., 18.5)"),
  monthly_payment: z.number().describe("Current monthly payment amount"),
  payoff_months: z.number().describe("Months to payoff at current payment rate"),
  monthly_interest_saved_if_accelerated: z.number().describe("Interest saved per month if payment increased by 50%"),
  strategy: z.string().describe("Detailed payoff strategy with timeline and recommendations"),
});

export type DebtPayoffPlanPayload = z.infer<typeof debtPayoffPlanPayloadSchema>;

export const debtPayoffPlanPlugin: ArtifactPlugin = {
  id: "debt-payoff-plan",
  name: "Debt Payoff Plan",
  description: "Detailed payoff strategy for debt. Includes timeline, interest savings, and acceleration scenarios.",
  badgeColor: "destructive",
  keywords: ["debt", "payoff", "credit card", "loan", "interest", "balance"],
  detectionPrompt: `Look for mentions of debt, loans, credit card balances, or questions about paying off debt faster. The user might ask "How long to pay off my credit card?" or mention "I have $2,400 in credit card debt." Flag any debt-related concern, especially if they're interested in acceleration strategies.`,
  payloadSchema: {
    type: "object",
    properties: {
      debt_type: {
        type: "string",
        description: "Type of debt",
      },
      current_balance: {
        type: "number",
        description: "Current outstanding balance",
      },
      interest_rate: {
        type: "number",
        description: "Annual interest rate as percentage",
      },
      monthly_payment: {
        type: "number",
        description: "Current monthly payment",
      },
      payoff_months: {
        type: "number",
        description: "Months to payoff at current rate",
      },
      monthly_interest_saved_if_accelerated: {
        type: "number",
        description: "Interest saved per month if payment increased 50%",
      },
      strategy: {
        type: "string",
        description: "Detailed payoff strategy with timeline",
      },
    },
    required: [
      "debt_type",
      "current_balance",
      "interest_rate",
      "monthly_payment",
      "payoff_months",
      "monthly_interest_saved_if_accelerated",
      "strategy",
    ],
  },
};
