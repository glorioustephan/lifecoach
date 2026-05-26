import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, TrendingUp, AlertCircle, RefreshCw } from "lucide-react";
import { ViewHeader } from "~/components/ui/ViewHeader";
import { Button } from "~/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";
import { EmptyState } from "~/components/ui/EmptyState";
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
    <div className="flex h-full min-h-0 flex-col">
      <ViewHeader
        title="Financial Overview"
        subtitle="360° view of your finances"
        actions={
          <Button
            onClick={handleSync}
            disabled={syncLoading}
            variant="secondary"
            size="sm"
            className="gap-2"
          >
            <RefreshCw className={cn("size-3.5", syncLoading && "animate-spin")} strokeWidth={1.75} />
            {syncLoading ? "Syncing…" : "Sync"}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto mobile-safe-bottom">
        <div className="mx-auto max-w-2xl space-y-6 px-4 pb-6 pt-8 md:px-6">

          {/* Account Overview Cards */}
          <section>
            <h2 className="mb-3 text-xs uppercase tracking-wide text-fg-faint">
              Account Overview
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Checking */}
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs font-medium text-fg-muted">Checking</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-semibold text-fg">
                    ${accounts
                      .filter((a) => a.type === "checking")
                      .reduce((sum, a) => sum + a.balance, 0)
                      .toFixed(2)}
                  </div>
                </CardContent>
              </Card>

              {/* Savings */}
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs font-medium text-fg-muted">Savings</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-semibold text-fg">
                    ${accounts
                      .filter((a) => a.type === "savings")
                      .reduce((sum, a) => sum + a.balance, 0)
                      .toFixed(2)}
                  </div>
                </CardContent>
              </Card>

              {/* Net Worth */}
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs font-medium text-fg-muted">Net Worth</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={cn(
                    "text-xl font-semibold",
                    netWorth >= 0 ? "text-success-500" : "text-destructive-300",
                  )}>
                    ${netWorth.toFixed(2)}
                  </div>
                </CardContent>
              </Card>

              {/* Savings Rate */}
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs font-medium text-fg-muted">Savings Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-1 text-xl font-semibold text-fg">
                    {savingsRate}
                    <span className="text-sm font-normal text-fg-muted">%</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Budget Status */}
          {budgets.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs uppercase tracking-wide text-fg-faint">
                Budget Status (This Month)
              </h2>
              <div className="divide-y divide-border-subtle rounded-md border border-border bg-surface">
                {budgets.map((budget) => {
                  const percent = Math.round((budget.spent / budget.limit) * 100);
                  const isOver = percent > 100;
                  const isNear = percent > 80;

                  return (
                    <div key={budget.id} className="px-4 py-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium text-fg">
                          {budget.category}
                        </span>
                        <span className={cn(
                          "text-xs font-semibold",
                          isOver
                            ? "text-destructive-300"
                            : isNear
                              ? "text-warning-500"
                              : "text-success-500",
                        )}>
                          {percent}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-surface-elevated overflow-hidden">
                        <div
                          className={cn(
                            "h-full transition-all",
                            isOver
                              ? "bg-destructive-500"
                              : isNear
                                ? "bg-warning-500"
                                : "bg-success-500",
                          )}
                          style={{ width: `${Math.min(percent, 100)}%` }}
                        />
                      </div>
                      <div className="mt-1.5 text-xs text-fg-faint">
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
              <h2 className="mb-3 text-xs uppercase tracking-wide text-fg-faint">
                Recent Transactions
              </h2>
              <div className="divide-y divide-border-subtle rounded-md border border-border bg-surface">
                {transactions.slice(0, 10).map((txn) => (
                  <div
                    key={txn.id}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-fg">
                        {txn.merchant}
                      </div>
                      <div className="text-xs text-fg-faint">
                        {txn.category && <span>{txn.category} · </span>}
                        {new Date(txn.date).toLocaleDateString()}
                        {txn.isPending && <span> · Pending</span>}
                      </div>
                    </div>
                    <div className={cn(
                      "ml-4 shrink-0 text-sm font-semibold",
                      txn.amount > 0 ? "text-success-500" : "text-fg",
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
              <h2 className="mb-3 text-xs uppercase tracking-wide text-fg-faint">
                Investment Holdings
              </h2>
              <div className="divide-y divide-border-subtle rounded-md border border-border bg-surface">
                {holdings.map((holding) => {
                  const gainLoss = holding.costBasis ? holding.marketValue - holding.costBasis : 0;
                  const gainPercent =
                    holding.costBasis && holding.costBasis !== 0
                      ? ((gainLoss / holding.costBasis) * 100).toFixed(1)
                      : "0";

                  return (
                    <div
                      key={holding.id}
                      className="flex items-center justify-between px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-fg">
                          {holding.symbol}
                        </div>
                        <div className="text-xs text-fg-faint">
                          {holding.quantity} shares @ ${holding.currentPrice.toFixed(2)}
                        </div>
                      </div>
                      <div className="ml-4 shrink-0 text-right">
                        <div className="text-sm font-semibold text-fg">
                          ${holding.marketValue.toFixed(2)}
                        </div>
                        {holding.costBasis && (
                          <div
                            className={cn(
                              "text-xs font-semibold",
                              gainLoss >= 0 ? "text-success-500" : "text-destructive-300",
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
              <h2 className="mb-3 text-xs uppercase tracking-wide text-fg-faint">
                Financial Insights
              </h2>
              <div className="space-y-3">
                {insights.map((insight) => (
                  <Card
                    key={insight.id}
                    className={cn(
                      insight.priority === 3 && "border-destructive-500/30",
                      insight.priority === 2 && "border-warning-500/30",
                    )}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <CardTitle className="text-sm">{insight.topic}</CardTitle>
                          <p className="mt-0.5 text-xs capitalize text-fg-faint">
                            {insight.category}
                          </p>
                        </div>
                        {insight.priority === 3 && (
                          <AlertCircle className="size-4 shrink-0 text-destructive-300" strokeWidth={1.75} />
                        )}
                        {insight.priority === 2 && (
                          <TrendingUp className="size-4 shrink-0 text-warning-500" strokeWidth={1.75} />
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <p className="text-sm text-fg-muted">{insight.body}</p>
                      {insight.recommendation && (
                        <p className="text-sm font-medium text-fg">
                          {insight.recommendation}
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
            <EmptyState
              icon={<DollarSign className="size-8" strokeWidth={1.5} />}
              title="No financial data yet"
              body="Sync your Monarch Money account to see your financial overview."
              action={{
                label: syncLoading ? "Syncing…" : "Sync financial data",
                onClick: handleSync,
                disabled: syncLoading,
              }}
            />
          )}

        </div>
      </div>
    </div>
  );
}
