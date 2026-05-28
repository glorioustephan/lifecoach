import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { Storage } from "../../storage/index.js";
import { parseEpochInput } from "./epoch-input.js";
import {
  buildMonthlyRollup,
  buildCategorySubtotals,
  type MonthlyRollup,
} from "../../financial/rollup.js";
import { isTransferTxn } from "../../financial/transfer.js";

export const buildFinancialTools = (storage: Storage) => [
  tool(
    "query_accounts",
    "List all financial accounts with current balances and status.",
    {
      status: z.enum(["active", "inactive", "closed"]).optional(),
      type: z.enum(["checking", "savings", "credit_card", "investment", "debt", "other"]).optional(),
    },
    async ({ status, type }) => {
      const accounts = storage.financial.listAccounts({ status, type });
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
    "Search and filter financial transactions by account, date range, category, or amount. " +
      "Call this tool when the user wants to itemise, list, or drill down into specific transactions " +
      "for a period — e.g. 'show me all March income' or 'what did I spend on groceries last month?'. " +
      "Returns an array of transactions with id, date, merchant, amount, category, and notes. " +
      "Date bounds (`from`/`to`) must be Unix epoch milliseconds — e.g. 1709251200000 for 2024-03-01. " +
      "Values below 1e12 are auto-converted from seconds and a warning is logged.",
    {
      accountId: z.string().optional().describe("Filter to a single account by its internal ID."),
      from: z
        .number()
        .int()
        .optional()
        .describe(
          "Unix epoch milliseconds start bound (inclusive). Example: 1709251200000 for 2024-03-01. " +
            "Values < 1e12 are auto-converted from seconds. Omit or pass 0 for no lower bound.",
        ),
      to: z
        .number()
        .int()
        .optional()
        .describe(
          "Unix epoch milliseconds end bound (inclusive). Example: 1711929599999 for 2024-03-31 23:59:59. " +
            "Values < 1e12 are auto-converted from seconds. Omit for no upper bound.",
        ),
      category: z.string().optional().describe("Filter by effective transaction category name."),
      minAmount: z
        .number()
        .optional()
        .describe("Only return transactions where |amount| >= this value."),
      limit: z.number().int().default(50).describe("Maximum rows to return. Default 50, max 200."),
    },
    async ({ accountId, from, to, category, minAmount, limit }) => {
      const fromMs = parseEpochInput(from, "from", "query_transactions");
      const toMs = parseEpochInput(to, "to", "query_transactions");

      const transactions = storage.financial.queryTransactions({
        accountId,
        from: fromMs,
        to: toMs,
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
        spent: 0,
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
      const updated = storage.financial.updateTransactionNotes(transactionId, note);
      if (!updated) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: Transaction ${transactionId} not found`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              transactionId,
              notes: updated.notes,
              message: `Note saved: "${note}"`,
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
        category,
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

  tool(
    "financial_monthly_rollup",
    "Compute the canonical monthly financial rollup (income, expenses, burn, savings rate) " +
      "for a given month or window. Returns transfer-excluded totals with contributing_tx_ids[] " +
      "for every figure and G1–G6 guard results. Use this — not raw transaction queries — whenever " +
      "you intend to cite a burn figure or savings rate. Guards G1–G6 must all pass before narrating " +
      "any headline number; if any guard fails, surface the guard detail instead of the figure.\n\n" +
      "Date inputs must be Unix epoch milliseconds. Values < 1e12 are auto-converted from seconds.",
    {
      month: z
        .string()
        .optional()
        .describe(
          "Calendar month in YYYY-MM format (e.g. '2026-03'). If omitted, computes the current " +
            "month-to-date (MTD). Takes precedence over from/to if all three are provided.",
        ),
      from: z
        .number()
        .int()
        .optional()
        .describe(
          "Custom window start, Unix epoch milliseconds (inclusive). Use only when month is omitted " +
            "and you need a non-calendar window such as trailing-30.",
        ),
      to: z
        .number()
        .int()
        .optional()
        .describe(
          "Custom window end, Unix epoch milliseconds (inclusive). Defaults to now if omitted.",
        ),
      window_type: z
        .enum(["calendar_month", "mtd", "trailing_30", "trailing_90"])
        .optional()
        .describe(
          "Window type label used by guards (default: 'calendar_month' when month is set, 'mtd' otherwise).",
        ),
    },
    async ({ month, from, to, window_type }) => {
      let fromMs: number;
      let toMs: number;
      let period: string;
      let windowType: MonthlyRollup["windowType"];

      if (month) {
        const [yearStr, monthStr] = month.split("-");
        const year = parseInt(yearStr ?? "0", 10);
        const monthZeroBased = parseInt(monthStr ?? "1", 10) - 1;
        fromMs = new Date(year, monthZeroBased, 1, 0, 0, 0).getTime();
        toMs = new Date(year, monthZeroBased + 1, 1, 0, 0, 0).getTime() - 1;
        period = month;
        windowType = (window_type as MonthlyRollup["windowType"]) ?? "calendar_month";
      } else {
        const nowMs = Date.now();
        fromMs = parseEpochInput(from, "from", "financial_monthly_rollup") ?? (() => {
          const d = new Date(nowMs);
          return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0).getTime();
        })();
        toMs = parseEpochInput(to, "to", "financial_monthly_rollup") ?? nowMs;
        windowType = (window_type as MonthlyRollup["windowType"]) ?? "mtd";
        const d = new Date(fromMs);
        period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-MTD`;
      }

      const transactions = storage.financial.queryTransactions({ from: fromMs, to: toMs });
      const rollup = buildMonthlyRollup({
        transactions,
        period,
        windowType,
        fromMs,
        toMs,
      });
      const categorySubtotals = buildCategorySubtotals(transactions);

      const allGuardsPassed = rollup.guardsPassed.every((g) => g.passed);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                period: rollup.period,
                window_type: rollup.windowType,
                days_in_window: rollup.daysInWindow,
                income: rollup.income,
                expenses: rollup.expenses,
                burn: rollup.burn,
                savings_rate: isNaN(rollup.savingsRate) ? null : rollup.savingsRate,
                transfer_total: rollup.transferTotal,
                transfer_ratio: rollup.transferRatio,
                contributing_tx_ids: rollup.contributingTxIds,
                transfer_tx_ids: rollup.transferTxIds,
                outlier_month_detected: rollup.outlierMonthDetected,
                guards: rollup.guardsPassed,
                all_guards_passed: allGuardsPassed,
                category_subtotals: categorySubtotals.map((c) => ({
                  category: c.category,
                  total: c.total,
                  tx_ids: c.txIds,
                })),
                _note: allGuardsPassed
                  ? "All guards passed — safe to narrate this figure."
                  : "One or more guards FAILED — do not cite this figure; surface the guard detail to the user instead.",
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
    "get_rollup_contributors",
    "Drill down into the transactions that make up a previously-cited rollup figure. " +
      "Call this when the user asks 'what makes up that $X?' or 'can you itemize that?'. " +
      "Requires the same period and optional category filter used to build the rollup. " +
      "Returns the full transaction rows (id, date, merchant, amount, category, description, account) " +
      "so the user can verify or challenge the number. This is the G5 itemization contract — " +
      "no rollup figure may be cited without this drill-down being available.\n\n" +
      "Date bounds must be Unix epoch milliseconds. Values < 1e12 are auto-converted from seconds.",
    {
      month: z
        .string()
        .optional()
        .describe(
          "Calendar month in YYYY-MM format (e.g. '2026-03'). Mutually exclusive with from/to.",
        ),
      from: z
        .number()
        .int()
        .optional()
        .describe("Custom window start, Unix epoch milliseconds (inclusive)."),
      to: z
        .number()
        .int()
        .optional()
        .describe("Custom window end, Unix epoch milliseconds (inclusive). Defaults to now."),
      category: z
        .string()
        .optional()
        .describe(
          "Filter to a specific spending category (e.g. 'Dining', 'Groceries'). " +
            "If omitted, returns all contributing transactions for the period.",
        ),
      include_transfers: z
        .boolean()
        .default(false)
        .describe(
          "Set to true to also return the excluded transfer transactions for audit purposes. " +
            "Default false — contributors only.",
        ),
    },
    async ({ month, from, to, category, include_transfers }) => {
      let fromMs: number;
      let toMs: number;
      let period: string;

      if (month) {
        const [yearStr, monthStr] = month.split("-");
        const year = parseInt(yearStr ?? "0", 10);
        const monthZeroBased = parseInt(monthStr ?? "1", 10) - 1;
        fromMs = new Date(year, monthZeroBased, 1, 0, 0, 0).getTime();
        toMs = new Date(year, monthZeroBased + 1, 1, 0, 0, 0).getTime() - 1;
        period = month;
      } else {
        const nowMs = Date.now();
        fromMs = parseEpochInput(from, "from", "get_rollup_contributors") ?? (() => {
          const d = new Date(nowMs);
          return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0).getTime();
        })();
        toMs = parseEpochInput(to, "to", "get_rollup_contributors") ?? nowMs;
        const d = new Date(fromMs);
        period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-MTD`;
      }

      const allTxns = storage.financial.queryTransactions({ from: fromMs, to: toMs });

      if (allTxns.length === 0) {
        console.warn(
          `[get_rollup_contributors] Zero transactions found for period=${period} ` +
            `from=${new Date(fromMs).toISOString()} to=${new Date(toMs).toISOString()}. ` +
            `Verify the date range is correct before returning a zero-based result.`,
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  period,
                  warning:
                    "No transactions found in this date range. " +
                    "Verify the from/to bounds are in milliseconds and match the synced data.",
                  contributors: [],
                  transfers: [],
                  count: 0,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      const contributors: typeof allTxns = [];
      const transferRows: typeof allTxns = [];

      for (const t of allTxns) {
        if (isTransferTxn(t)) {
          transferRows.push(t);
        } else {
          contributors.push(t);
        }
      }

      // Apply category filter after transfer exclusion.
      const filtered = category
        ? contributors.filter((t) => t.category === category)
        : contributors;

      const accounts = storage.financial.listAccounts();
      const accountMap = new Map(accounts.map((a) => [a.id, a.displayName]));

      const formatTx = (t: (typeof allTxns)[0]) => ({
        id: t.id,
        date: new Date(t.date).toISOString().slice(0, 10),
        merchant: t.merchant,
        amount: t.amount,
        category: t.category ?? "uncategorized",
        description: t.description ?? null,
        account: accountMap.get(t.accountId) ?? t.accountId,
        is_recurring: t.isRecurring,
      });

      const totalContributing = filtered.reduce(
        (sum, t) => sum + (t.amount < 0 ? Math.abs(t.amount) : t.amount),
        0,
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                period,
                category_filter: category ?? null,
                contributing_count: filtered.length,
                contributing_total: totalContributing,
                contributors: filtered.map(formatTx),
                ...(include_transfers
                  ? {
                      excluded_transfer_count: transferRows.length,
                      excluded_transfers: transferRows.map(formatTx),
                    }
                  : {
                      excluded_transfer_count: transferRows.length,
                    }),
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
