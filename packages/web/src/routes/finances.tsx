import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, TrendingUp, CreditCard, AlertCircle, RefreshCw } from "lucide-react";
import { ViewHeader } from "~/components/ui/ViewHeader";
import { Button } from "~/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";
import { api } from "~/lib/api";
import { cn } from "~/lib/cn";

export const Route = createFileRoute("/finances")({
  component: FinancesRoute,
});

interface Account {
  id: string;
  displayName: string;
  type: string;
  balance: number;
  status: string;
  institution?: string;
  syncedAt: number;
}

interface Budget {
  id: string;
  category: string;
  month: string;
  limit: number;
  spent: number;
}

interface Transaction {
  id: string;
  date: number;
  merchant: string;
  amount: number;
  category?: string;
  isPending: boolean;
}

interface Holding {
  id: string;
  symbol: string;
  quantity: number;
  currentPrice: number;
  marketValue: number;
  costBasis?: number;
}

interface FinancialInsight {
  id: string;
  topic: string;
  body: string;
  category: string;
  priority: number;
  recommendation?: string;
  createdAt: number;
}

function FinancesRoute(): JSX.Element {
  const [syncLoading, setSyncLoading] = useState(false);

  // Mock data queries - in real app these would be actual API calls
  const { data: accountsData, refetch: refetchAccounts } = useQuery({
    queryKey: ["finances", "accounts"],
    queryFn: async () => ({
      accounts: [] as Account[],
      totalAssets: 0,
      totalLiabilities: 0,
      netWorth: 0,
    }),
  });

  const { data: budgetsData } = useQuery({
    queryKey: ["finances", "budgets"],
    queryFn: async () => ({
      budgets: [] as Budget[],
      totalBudget: 0,
      totalSpent: 0,
    }),
  });

  const { data: transactionsData } = useQuery({
    queryKey: ["finances", "transactions"],
    queryFn: async () => ({
      transactions: [] as Transaction[],
    }),
  });

  const { data: holdingsData } = useQuery({
    queryKey: ["finances", "holdings"],
    queryFn: async () => ({
      holdings: [] as Holding[],
      totalValue: 0,
    }),
  });

  const { data: insightsData } = useQuery({
    queryKey: ["finances", "insights"],
    queryFn: async () => ({
      insights: [] as FinancialInsight[],
    }),
  });

  const handleSync = async () => {
    setSyncLoading(true);
    try {
      // Call sync endpoint
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await refetchAccounts();
    } finally {
      setSyncLoading(false);
    }
  };

  const accounts = accountsData?.accounts ?? [];
  const budgets = budgetsData?.budgets ?? [];
  const transactions = transactionsData?.transactions ?? [];
  const holdings = holdingsData?.holdings ?? [];
  const insights = insightsData?.insights ?? [];
  const netWorth = accountsData?.netWorth ?? 0;
  const savingsRate =
    accountsData && accountsData.totalAssets > 0
      ? ((accountsData.totalAssets / (accountsData.totalAssets + accountsData.totalLiabilities)) * 100).toFixed(1)
      : "0";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      <ViewHeader
        icon={DollarSign}
        title="Financial Overview"
        subtitle="360° view of your finances"
        action={
          <Button
            onClick={handleSync}
            disabled={syncLoading}
            variant="secondary"
            className="gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", syncLoading && "animate-spin")} />
            {syncLoading ? "Syncing..." : "Sync"}
          </Button>
        }
      />

      {/* Account Overview Cards */}
      <div className="mx-auto max-w-7xl space-y-8 px-4 py-8">
        <section>
          <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-50">
            Account Overview
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Checking Account */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  Checking
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                  ${accounts
                    .filter((a) => a.type === "checking")
                    .reduce((sum, a) => sum + a.balance, 0)
                    .toFixed(2)}
                </div>
              </CardContent>
            </Card>

            {/* Savings Account */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  Savings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                  ${accounts
                    .filter((a) => a.type === "savings")
                    .reduce((sum, a) => sum + a.balance, 0)
                    .toFixed(2)}
                </div>
              </CardContent>
            </Card>

            {/* Net Worth */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  Net Worth
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={cn(
                  "text-2xl font-bold",
                  netWorth >= 0
                    ? "text-green-600 dark:text-green-400"
                    : "text-red-600 dark:text-red-400",
                )}>
                  ${netWorth.toFixed(2)}
                </div>
              </CardContent>
            </Card>

            {/* Savings Rate */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  Savings Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {savingsRate}%
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Budget Status */}
        {budgets.length > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-50">
              Budget Status (This Month)
            </h2>
            <div className="space-y-3">
              {budgets.map((budget) => {
                const percent = Math.round((budget.spent / budget.limit) * 100);
                const isOver = percent > 100;
                const isNear = percent > 80;

                return (
                  <div key={budget.id} className="rounded-lg bg-white p-4 dark:bg-slate-800">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-medium text-slate-900 dark:text-slate-50">
                        {budget.category}
                      </span>
                      <span className={cn(
                        "text-sm font-semibold",
                        isOver
                          ? "text-red-600 dark:text-red-400"
                          : isNear
                            ? "text-yellow-600 dark:text-yellow-400"
                            : "text-green-600 dark:text-green-400",
                      )}>
                        {percent}%
                      </span>
                    </div>
                    <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full transition-all",
                          isOver
                            ? "bg-red-600 dark:bg-red-500"
                            : isNear
                              ? "bg-yellow-600 dark:bg-yellow-500"
                              : "bg-green-600 dark:bg-green-500",
                        )}
                        style={{ width: `${Math.min(percent, 100)}%` }}
                      />
                    </div>
                    <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                      ${budget.spent.toFixed(2)} / ${budget.limit.toFixed(2)}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Recent Transactions */}
        {transactions.length > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-50">
              Recent Transactions
            </h2>
            <div className="space-y-2 rounded-lg bg-white dark:bg-slate-800">
              {transactions.slice(0, 10).map((txn) => (
                <div
                  key={txn.id}
                  className="flex items-center justify-between border-b border-slate-200 p-3 last:border-b-0 dark:border-slate-700"
                >
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-50">
                      {txn.merchant}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400">
                      {txn.category && <span>{txn.category} • </span>}
                      {new Date(txn.date).toLocaleDateString()}
                      {txn.isPending && <span> • Pending</span>}
                    </div>
                  </div>
                  <div className={cn(
                    "font-semibold",
                    txn.amount > 0
                      ? "text-green-600 dark:text-green-400"
                      : "text-slate-900 dark:text-slate-50",
                  )}>
                    {txn.amount > 0 ? "+" : ""}${Math.abs(txn.amount).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Holdings */}
        {holdings.length > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-50">
              Investment Holdings
            </h2>
            <div className="space-y-2 rounded-lg bg-white dark:bg-slate-800">
              {holdings.map((holding) => {
                const gainLoss = holding.costBasis ? holding.marketValue - holding.costBasis : 0;
                const gainPercent =
                  holding.costBasis && holding.costBasis !== 0
                    ? ((gainLoss / holding.costBasis) * 100).toFixed(1)
                    : "0";

                return (
                  <div
                    key={holding.id}
                    className="flex items-center justify-between border-b border-slate-200 p-3 last:border-b-0 dark:border-slate-700"
                  >
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-50">
                        {holding.symbol}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-400">
                        {holding.quantity} shares @ ${holding.currentPrice.toFixed(2)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-slate-900 dark:text-slate-50">
                        ${holding.marketValue.toFixed(2)}
                      </div>
                      {holding.costBasis && (
                        <div
                          className={cn(
                            "text-xs font-semibold",
                            gainLoss >= 0
                              ? "text-green-600 dark:text-green-400"
                              : "text-red-600 dark:text-red-400",
                          )}
                        >
                          {gainLoss >= 0 ? "+" : ""}${gainLoss.toFixed(2)} ({gainPercent}%)
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Financial Insights */}
        {insights.length > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-50">
              Financial Insights
            </h2>
            <div className="space-y-3">
              {insights.map((insight) => (
                <Card
                  key={insight.id}
                  className={cn(
                    insight.priority === 3 && "border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20",
                    insight.priority === 2 && "border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/20",
                    insight.priority === 1 && "border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/20",
                  )}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{insight.topic}</CardTitle>
                        <p className="text-xs text-slate-600 dark:text-slate-400 capitalize">
                          {insight.category}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {insight.priority === 3 && (
                          <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm text-slate-700 dark:text-slate-300">{insight.body}</p>
                    {insight.recommendation && (
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                        💡 {insight.recommendation}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Empty State */}
        {accounts.length === 0 && (
          <Card className="text-center py-12">
            <DollarSign className="mx-auto h-12 w-12 text-slate-400 dark:text-slate-600 mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">
              No Financial Data Yet
            </h3>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              Sync your Monarch Money account to see your financial overview
            </p>
            <Button onClick={handleSync} disabled={syncLoading}>
              {syncLoading ? "Syncing..." : "Sync Financial Data"}
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
}
