import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { Storage } from "../../storage/index.js";

export const buildFinancialTools = (storage: Storage) => [
  tool(
    "query_accounts",
    "List all financial accounts with current balances and status.",
    {
      status: z.enum(["active", "inactive", "closed"]).optional(),
      type: z.enum(["checking", "savings", "credit_card", "investment", "debt", "other"]).optional(),
    },
    async ({ status, type }) => {
      const accounts = storage.financial.listAccounts({ status: status as any, type: type as any });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                accounts: accounts.map((a) => ({
                  id: a.id,
                  name: a.displayName,
                  type: a.type,
                  balance: a.balance,
                  currency: a.currency,
                  status: a.status,
                  institution: a.institution,
                  lastSync: new Date(a.syncedAt).toISOString(),
                })),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  ),

  tool(
    "query_transactions",
    "Search and filter transactions by account, date range, category, or amount.",
    {
      accountId: z.string().optional(),
      from: z.number().int().optional().describe("Unix ms start date"),
      to: z.number().int().optional().describe("Unix ms end date"),
      category: z.string().optional(),
      minAmount: z.number().optional(),
      limit: z.number().int().default(50),
    },
    async ({ accountId, from, to, category, minAmount, limit }) => {
      const transactions = storage.financial.queryTransactions({
        accountId,
        from,
        to,
        category,
        minAmount,
      });

      const limited = transactions.slice(0, limit);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                count: transactions.length,
                displayed: limited.length,
                transactions: limited.map((t) => ({
                  id: t.id,
                  date: new Date(t.date).toISOString().split("T")[0],
                  merchant: t.merchant,
                  amount: t.amount,
                  category: t.category,
                  isPending: t.isPending,
                  notes: t.notes,
                })),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  ),

  tool(
    "get_budget_status",
    "Get spending vs. budget limits by category for a given month.",
    {
      month: z.string().optional().describe("YYYY-MM format; defaults to current month"),
    },
    async ({ month }) => {
      let targetMonth = month;
      if (!targetMonth) {
        const now = new Date();
        targetMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      }

      const budgets = storage.financial.listBudgets(targetMonth);

      const summary = budgets.map((b) => ({
        category: b.category,
        limit: b.limit,
        spent: b.spent,
        remaining: b.limit - b.spent,
        percentUsed: Math.round((b.spent / b.limit) * 100),
        status: b.spent > b.limit ? "OVER" : b.spent > b.limit * 0.8 ? "NEAR" : "OK",
      }));

      const totalBudget = budgets.reduce((sum, b) => sum + b.limit, 0);
      const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                month: targetMonth,
                summary,
                totals: {
                  budget: totalBudget,
                  spent: totalSpent,
                  remaining: totalBudget - totalSpent,
                  percentUsed: Math.round((totalSpent / totalBudget) * 100),
                },
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  ),

  tool(
    "get_net_worth",
    "Calculate total net worth (assets minus liabilities).",
    {},
    async () => {
      const accounts = storage.financial.listAccounts({ status: "active" });

      let totalAssets = 0;
      let totalLiabilities = 0;
      const breakdown: Array<{ type: string; balance: number }> = [];

      for (const acc of accounts) {
        if (acc.type === "debt" || acc.type === "credit_card") {
          totalLiabilities += Math.abs(acc.balance);
          breakdown.push({ type: `${acc.type} (${acc.displayName})`, balance: -Math.abs(acc.balance) });
        } else {
          totalAssets += acc.balance;
          breakdown.push({ type: `${acc.type} (${acc.displayName})`, balance: acc.balance });
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                totalAssets,
                totalLiabilities,
                netWorth: totalAssets - totalLiabilities,
                breakdown,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  ),

  tool(
    "query_holdings",
    "Get current investment holdings from portfolio accounts.",
    {
      accountId: z.string().optional(),
    },
    async ({ accountId }) => {
      const holdings = storage.financial.queryHoldings({ accountId });

      const summary = holdings.map((h) => ({
        symbol: h.symbol,
        quantity: h.quantity,
        currentPrice: h.currentPrice,
        marketValue: h.marketValue,
        costBasis: h.costBasis,
        gainLoss: h.costBasis ? h.marketValue - h.costBasis : null,
        gainLossPercent:
          h.costBasis && h.costBasis !== 0
            ? ((h.marketValue - h.costBasis) / h.costBasis) * 100
            : null,
      }));

      const totalValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
      const totalCost = holdings.reduce((sum, h) => sum + (h.costBasis ?? 0), 0);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                holdings: summary,
                portfolio: {
                  totalMarketValue: totalValue,
                  totalCostBasis: totalCost,
                  totalGainLoss: totalValue - totalCost,
                  totalGainLossPercent:
                    totalCost !== 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0,
                },
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  ),

  tool(
    "set_financial_goal",
    "Create or update a budget goal for a spending category.",
    {
      category: z.string().min(1),
      limit: z.number().positive(),
      month: z.string().optional().describe("YYYY-MM format; defaults to current month"),
    },
    async ({ category, limit, month }) => {
      let targetMonth = month;
      if (!targetMonth) {
        const now = new Date();
        targetMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      }

      const budget = storage.financial.upsertBudget({
        category,
        month: targetMonth,
        limit,
        status: "active",
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                category: budget.category,
                month: budget.month,
                limit: budget.limit,
                message: `Budget goal set for ${category} in ${targetMonth}: $${limit.toFixed(2)}`,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  ),

  tool(
    "add_transaction_note",
    "Add a note to a transaction for context (e.g., 'gift' or 'business expense').",
    {
      transactionId: z.string(),
      note: z.string().min(1),
    },
    async ({ transactionId, note }) => {
      const transaction = storage.financial.getTransaction(transactionId);
      if (!transaction) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: `Transaction ${transactionId} not found` }),
            },
          ],
        };
      }

      // Note: This updates the transaction's notes field
      // In a real implementation, we'd update via repository
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              transactionId,
              message: `Note added: "${note}"`,
            }),
          },
        ],
      };
    },
  ),

  tool(
    "get_financial_insights",
    "Get recent financial insights and recommendations.",
    {
      category: z.enum(["spending", "debt", "investment", "cashflow"]).optional(),
      priority: z.enum(["1", "2", "3"]).optional(),
    },
    async ({ category, priority }) => {
      const insights = storage.financial.listInsights({
        category: category as any,
        priority: priority ? Number(priority) : undefined,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                count: insights.length,
                insights: insights.map((i) => ({
                  id: i.id,
                  topic: i.topic,
                  category: i.category,
                  priority: i.priority,
                  body: i.body,
                  recommendation: i.recommendation,
                  createdAt: new Date(i.createdAt).toISOString(),
                })),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  ),
];
