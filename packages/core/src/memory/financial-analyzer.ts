import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { FinancialInsight, NewFinancialInsight } from "@lifecoach/schemas";
import type { Storage } from "../storage/index.js";
import { withRetry } from "../util/retry.js";
import { LifecoachError } from "../util/errors.js";

const financialInsightPayloadSchema = z.object({
  insights: z
    .array(
      z.object({
        topic: z.string().min(1),
        body: z.string().min(1),
        category: z.enum(["spending", "debt", "investment", "cashflow"]),
        priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
        recommendation: z.string().optional(),
        sourceDataIds: z.array(z.string()).default([]),
      }),
    )
    .max(5),
});
type FinancialInsightPayload = z.infer<typeof financialInsightPayloadSchema>;

const TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    insights: {
      type: "array",
      maxItems: 5,
      description: "0–3 actionable financial insights. Be selective and specific.",
      items: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            description:
              "Short title (4–8 words). E.g. 'Dining spending up 40% this month', 'Accelerate credit card payoff'.",
          },
          body: {
            type: "string",
            description:
              "1–2 paragraphs. Address the user as 'you'. Be specific with numbers and timeframes. Include concrete recommendations.",
          },
          category: {
            type: "string",
            enum: ["spending", "debt", "investment", "cashflow"],
            description:
              "Categorize the insight: spending (budget/category analysis), debt (payoff strategies), investment (portfolio health), cashflow (income/expense trends).",
          },
          priority: {
            type: "integer",
            enum: [1, 2, 3],
            description: "1 = nice to notice, 2 = worth noticing, 3 = needs attention soon",
          },
          recommendation: {
            type: "string",
            description: "Optional actionable recommendation (1 sentence). E.g. 'Set dining budget to $150/week'.",
          },
          sourceDataIds: {
            type: "array",
            items: { type: "string" },
            description: "IDs of transactions or accounts that anchored this insight.",
          },
        },
        required: ["topic", "body", "category"],
      },
    },
  },
  required: ["insights"],
};

interface FinancialContextData {
  accounts: Array<{ id: string; displayName: string; type: string; balance: number; status: string }>;
  recentTransactions: Array<{
    id: string;
    accountId: string;
    date: number;
    amount: number;
    merchant: string;
    category?: string;
  }>;
  budgets: Array<{ category: string; month: string; limit: number; spent: number }>;
  holdings: Array<{ symbol: string; quantity: number; marketValue: number; costBasis?: number }>;
  priorInsights: Array<{ topic: string; category: string; body: string; createdAt: number }>;
}

const gatherFinancialContext = (storage: Storage): FinancialContextData => {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const last90Days = now.getTime() - 90 * 24 * 60 * 60 * 1000;

  const accounts = storage.financial.listAccounts({ status: "active" });

  const recentTransactions = storage.financial.queryTransactions({
    from: last90Days,
  });

  const budgets = storage.financial.listBudgets(thisMonth);

  // Get latest holdings snapshot
  const allHoldings = storage.financial.queryHoldings();
  const latestSnapshot = allHoldings[0]?.snapshotDate ?? 0;
  const holdings = allHoldings.filter((h) => h.snapshotDate === latestSnapshot);

  const priorInsights = storage.financial.listInsights().slice(0, 10);

  return {
    accounts: accounts.map((a) => ({
      id: a.id,
      displayName: a.displayName,
      type: a.type,
      balance: a.balance,
      status: a.status,
    })),
    recentTransactions: recentTransactions.map((t) => ({
      id: t.id,
      accountId: t.accountId,
      date: t.date,
      amount: t.amount,
      merchant: t.merchant,
      category: t.category,
    })),
    budgets: budgets.map((b) => ({
      category: b.category,
      month: b.month,
      limit: b.limit,
      spent: b.spent,
    })),
    holdings: holdings.map((h) => ({
      symbol: h.symbol,
      quantity: h.quantity,
      marketValue: h.marketValue,
      costBasis: h.costBasis,
    })),
    priorInsights: priorInsights.map((i) => ({
      topic: i.topic,
      category: i.category,
      body: i.body,
      createdAt: i.createdAt,
    })),
  };
};

const renderFinancialContext = (data: FinancialContextData): string => {
  const parts: string[] = [];

  // Accounts overview
  if (data.accounts.length > 0) {
    parts.push("## Accounts");
    const totalAssets = data.accounts
      .filter((a) => a.type !== "debt" && a.type !== "credit_card")
      .reduce((sum, a) => sum + a.balance, 0);
    const totalDebts = data.accounts
      .filter((a) => a.type === "debt" || a.type === "credit_card")
      .reduce((sum, a) => sum + Math.abs(a.balance), 0);

    for (const acc of data.accounts) {
      parts.push(`- [${acc.id}] ${acc.displayName} (${acc.type}): $${acc.balance.toFixed(2)}`);
    }
    parts.push(`\nNet worth: $${(totalAssets - totalDebts).toFixed(2)} (assets: $${totalAssets.toFixed(2)}, debts: $${totalDebts.toFixed(2)})`);
  }

  // Budgets
  if (data.budgets.length > 0) {
    parts.push("\n## Budgets (This Month)");
    for (const b of data.budgets) {
      const percent = Math.round((b.spent / b.limit) * 100);
      const status = percent > 100 ? "OVER" : percent > 80 ? "near" : "on";
      parts.push(
        `- ${b.category}: $${b.spent.toFixed(2)} / $${b.limit.toFixed(2)} (${percent}%) [${status} track]`,
      );
    }
  }

  // Recent transactions (last 30 days)
  if (data.recentTransactions.length > 0) {
    parts.push("\n## Recent Transactions (Last 30 Days)");
    const last30 = data.recentTransactions.filter(
      (t) => t.date > Date.now() - 30 * 24 * 60 * 60 * 1000,
    );
    if (last30.length > 0) {
      const byCategory = new Map<string, number>();
      for (const t of last30) {
        const cat = t.category || "uncategorized";
        byCategory.set(cat, (byCategory.get(cat) || 0) + Math.abs(t.amount));
      }
      for (const [cat, total] of byCategory) {
        parts.push(`- ${cat}: $${total.toFixed(2)}`);
      }
    }
  }

  // Holdings
  if (data.holdings.length > 0) {
    parts.push("\n## Investment Holdings");
    let totalValue = 0;
    let totalBasis = 0;
    for (const h of data.holdings) {
      totalValue += h.marketValue;
      if (h.costBasis) totalBasis += h.costBasis;
      const gainLoss = h.costBasis ? h.marketValue - h.costBasis : 0;
      const gainPercent = h.costBasis && h.costBasis !== 0 ? (gainLoss / h.costBasis) * 100 : 0;
      parts.push(
        `- ${h.symbol}: ${h.quantity} units = $${h.marketValue.toFixed(2)}${h.costBasis ? ` (gain/loss: $${gainLoss.toFixed(2)}, ${gainPercent.toFixed(1)}%)` : ""}`,
      );
    }
    if (data.holdings.length > 0) {
      parts.push(`\nTotal portfolio: $${totalValue.toFixed(2)} (basis: $${totalBasis.toFixed(2)})`);
    }
  }

  // Prior insights
  if (data.priorInsights.length > 0) {
    parts.push("\n## Prior Insights (Don't Repeat)");
    for (const i of data.priorInsights) {
      parts.push(`- [${i.category}] ${i.topic}`);
    }
  }

  return parts.join("\n");
};

const buildFinancialPrompt = (context: string): string => `
You are a financial coach analyzing a user's financial data. Your goal is to surface insights about spending, debt, investments, and cashflow.

Focus on:
- Spending patterns and budget variances (category, timeframe, recommendations)
- Debt payoff strategies (balance, interest rate, payoff timeline, acceleration options)
- Investment health (concentration, allocation, unrealized gains/losses)
- Cashflow and savings rate trends

${context}

---

Call \`record_insights\` with 0–3 insights. Quality bar:
1. **Specific.** Use exact numbers, dates, categories. "Dining up $100 vs. $240 average" beats "dining is high."
2. **Actionable.** Include concrete recommendations. E.g., "Cut dining to $150/week" or "Pay $300/month to credit card instead of $200."
3. **Data-backed.** Anchor to accounts, transactions, budgets, or holdings shown above.
4. **Non-redundant.** Check "Prior Insights" — don't restate old findings unless evidence changed.
5. **Honest.** No financial advice, just observations and simple math. E.g., "At current pace, you'll pay off in X months" or "You're 40% through your dining budget."

Return empty array if nothing notable jumps out.`;

export interface FinancialAnalyzerOptions {
  apiKey: string;
  model?: string;
  maxRetries?: number;
}

export class FinancialAnalyzer {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxRetries: number;

  constructor(opts: FinancialAnalyzerOptions) {
    this.client = new Anthropic({ apiKey: opts.apiKey });
    this.model = opts.model ?? "claude-sonnet-4-6";
    this.maxRetries = opts.maxRetries ?? 3;
  }

  async generate(storage: Storage): Promise<FinancialInsight[]> {
    const context = gatherFinancialContext(storage);
    const rendered = renderFinancialContext(context);
    const prompt = buildFinancialPrompt(rendered);

    try {
      const response = await withRetry(
        () =>
          this.client.messages.create({
            model: this.model,
            max_tokens: 2048,
            tools: [
              {
                name: "record_insights",
                description: "Record 0–3 financial insights.",
                input_schema: TOOL_INPUT_SCHEMA,
              },
            ],
            tool_choice: { type: "tool", name: "record_insights" },
            messages: [{ role: "user", content: prompt }],
          }),
        { maxAttempts: this.maxRetries },
      );

      const toolUse = response.content.find((b) => b.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") {
        throw new LifecoachError(
          "FinancialAnalyzer: model didn't call record_insights",
          "FINANCIAL_NO_TOOL_USE",
        );
      }

      const payload = financialInsightPayloadSchema.parse(toolUse.input);

      const insights: FinancialInsight[] = [];
      for (const insight of payload.insights) {
        const stored = storage.financial.createInsight({
          topic: insight.topic,
          body: insight.body,
          category: insight.category,
          priority: insight.priority,
          recommendation: insight.recommendation,
          sourceDataIds: insight.sourceDataIds,
        });
        insights.push(stored);
      }

      return insights;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new LifecoachError(
          `FinancialAnalyzer: invalid response shape: ${error.message}`,
          "FINANCIAL_INVALID_RESPONSE",
        );
      }
      throw new LifecoachError(
        `FinancialAnalyzer failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
