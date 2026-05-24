import { z } from "zod";
import { getArtifactDescriptor } from "@lifecoach/schemas";
import type { ArtifactPlugin, FormattedArtifact } from "../types.js";

const debtPayoffSchema = z.object({
  debt_type: z.string().min(1),
  current_balance: z.number(),
  interest_rate: z.number(),
  monthly_payment: z.number(),
  payoff_months: z.number().int(),
  monthly_interest_saved_if_accelerated: z.number(),
  strategy: z.string(),
  confidence: z.number().min(0).max(1),
});

type DebtPayoffPlan = z.infer<typeof debtPayoffSchema>;

const itemSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    debt_type: { type: "string", description: "Type of debt, e.g. 'Credit Card', 'Student Loan'." },
    current_balance: { type: "number", description: "Current outstanding balance in dollars." },
    interest_rate: { type: "number", description: "Annual interest rate as a percentage, e.g. 18.5." },
    monthly_payment: { type: "number", description: "Current monthly payment amount." },
    payoff_months: { type: "number", description: "Months to payoff at current payment rate." },
    monthly_interest_saved_if_accelerated: {
      type: "number",
      description: "Interest saved per month if payment is increased by ~50%.",
    },
    strategy: { type: "string", description: "Concrete payoff strategy with timeline and recommendation." },
    confidence: {
      type: "number",
      description: "0–1: confidence this is a genuine debt payoff plan, not a passing mention of debt.",
    },
  },
  required: [
    "debt_type", "current_balance", "interest_rate", "monthly_payment",
    "payoff_months", "monthly_interest_saved_if_accelerated", "strategy", "confidence",
  ],
};

const format = (data: DebtPayoffPlan): FormattedArtifact => ({
  title: `${data.debt_type} payoff plan — ${data.payoff_months} months`,
  body: [
    `# ${data.debt_type} Payoff Plan`,
    "",
    `**Balance:** $${data.current_balance.toFixed(2)} at ${data.interest_rate}% APR`,
    `**Monthly payment:** $${data.monthly_payment.toFixed(2)} → payoff in **${data.payoff_months} months**`,
    "",
    data.strategy,
    "",
    `💡 Accelerating saves ~$${data.monthly_interest_saved_if_accelerated.toFixed(2)}/month in interest.`,
  ].join("\n"),
  tags: ["debt", "payoff", data.debt_type.toLowerCase().replace(/\s+/g, "-")],
  category: "finance",
});

export const debtPayoffPlanPlugin: ArtifactPlugin = {
  descriptor: getArtifactDescriptor("debt-payoff-plan")!,
  collectionKey: "debt_payoff_plans",
  itemSchema,
  promptHint:
    "debt_payoff_plans: specific debt balances with interest rate and payoff timeline. " +
    "Only extract when the user is clearly discussing a specific debt, not just mentioning debt in passing.",
  extractItem: (input) => {
    const parsed = debtPayoffSchema.safeParse(input);
    if (!parsed.success) return null;
    return { confidence: parsed.data.confidence, formatted: format(parsed.data) };
  },
};
