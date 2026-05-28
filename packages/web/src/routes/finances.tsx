import { useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DollarSign, RefreshCw, Upload } from "lucide-react";
import { ViewHeader } from "~/components/ui/ViewHeader";
import { Button } from "~/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";
import { EmptyState } from "~/components/ui/EmptyState";
import { api } from "~/lib/api";
import { cn } from "~/lib/cn";
import { formatCurrency, formatPercent } from "~/lib/money";
import { InsightCard } from "~/components/inbox/InsightCard";
import { toast } from "~/lib/use-toast";

export const Route = createFileRoute("/finances")({
  component: FinancesRoute,
});

function FinancesRoute(): JSX.Element {
  const queryClient = useQueryClient();

  const { data: accountsData } = useQuery({
    queryKey: ["finances", "accounts"],
    queryFn: api.financialAccounts,
  });

  const { data: budgetsData } = useQuery({
    queryKey: ["finances", "budgets"],
    queryFn: () => api.financialBudgets(),
  });

  const { data: transactionsData } = useQuery({
    queryKey: ["finances", "transactions"],
    queryFn: () => api.financialTransactions(),
  });

  const { data: holdingsData } = useQuery({
    queryKey: ["finances", "holdings"],
    queryFn: api.financialHoldings,
  });

  const { data: insightsData } = useQuery({
    queryKey: ["finances", "insights"],
    queryFn: api.financialInsights,
  });

  const syncMutation = useMutation({
    mutationFn: api.syncMonarch,
    onSuccess: (data) => {
      const r = (data as { result?: { transactionsUpserted?: number; accountsUpserted?: number } })
        ?.result;
      const parts: string[] = [];
      if (r?.transactionsUpserted !== undefined) parts.push(`${r.transactionsUpserted} transactions`);
      if (r?.accountsUpserted !== undefined) parts.push(`${r.accountsUpserted} accounts`);
      toast.success("Monarch synced", parts.length > 0 ? parts.join(" · ") : undefined);
    },
    onError: (err: unknown) => {
      toast.error("Sync failed", err instanceof Error ? err.message : String(err));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["finances"] });
      void queryClient.invalidateQueries({ queryKey: ["status"] });
      void queryClient.invalidateQueries({ queryKey: ["sources"] });
    },
  });
  const syncLoading = syncMutation.isPending;
  const handleSync = () => syncMutation.mutate();

  // One-time historical backfill from a Monarch CSV export. Idempotent on
  // re-upload; only seeds rows older than the live 90-day sync window.
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const backfillMutation = useMutation({
    mutationFn: (file: File) => api.backfillMonarchCsv(file),
    onSuccess: ({ result }) => {
      const parts = [
        `${result.transactionsUpserted} transactions imported`,
        `${result.accountsCreated} new account${result.accountsCreated === 1 ? "" : "s"}`,
        `${result.measurementsSeeded} monthly metrics seeded`,
      ];
      if (result.inLiveWindowSkipped > 0) parts.push(`${result.inLiveWindowSkipped} skipped (within 90-day live window)`);
      if (result.measurementsAlreadyPresent > 0) parts.push(`${result.measurementsAlreadyPresent} metric rows already present`);
      toast.success("Monarch history imported", parts.join(" · "));
      void queryClient.invalidateQueries({ queryKey: ["finances"] });
      void queryClient.invalidateQueries({ queryKey: ["status"] });
    },
    onError: (err: unknown) => {
      toast.error("Import failed", err instanceof Error ? err.message : String(err));
    },
  });
  const onPickCsv = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (file) backfillMutation.mutate(file);
  };

  const accounts = accountsData?.accounts ?? [];
  const budgets = budgetsData?.budgets ?? [];
  const transactions = transactionsData?.transactions ?? [];
  const holdings = holdingsData?.holdings ?? [];
  const insights = insightsData?.insights ?? [];
  const totalAssets = accountsData?.totalAssets ?? 0;
  const totalLiabilities = accountsData?.totalLiabilities ?? 0;
  const netWorth = accountsData?.netWorth ?? 0;
  // Ratio of assets to total balance sheet (assets / (assets + liabilities)).
  // NOTE: this is NOT a real savings rate (income - expenses) / income — see
  // .claude/plans/wave-1-correctness-safety.md W1.3 for the proper fix.
  const assetRatio =
    totalAssets > 0 ? (totalAssets / (totalAssets + totalLiabilities)) * 100 : 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewHeader
        title="Financial Overview"
        subtitle="360° view of your finances"
        actions={
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={onPickCsv}
              disabled={backfillMutation.isPending}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={backfillMutation.isPending}
              variant="secondary"
              size="sm"
              className="gap-2"
              title="Import a Monarch CSV export to seed history older than the live 90-day window. Idempotent on re-upload."
            >
              <Upload className="size-3.5" strokeWidth={1.75} />
              {backfillMutation.isPending ? "Importing…" : "Import history"}
            </Button>
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
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto mobile-safe-bottom">
        <div className="mx-auto max-w-2xl space-y-6 px-4 pb-6 pt-8 md:px-6">

          {/* Account Overview Cards */}
          {accounts.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs uppercase tracking-wide text-fg-faint">
              Account Overview
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Assets */}
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs font-medium text-fg-muted">Assets</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-semibold text-fg">
                    {formatCurrency(totalAssets)}
                  </div>
                </CardContent>
              </Card>

              {/* Debts */}
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs font-medium text-fg-muted">Debts</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-semibold text-fg">
                    {formatCurrency(totalLiabilities)}
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
                    {formatCurrency(netWorth)}
                  </div>
                </CardContent>
              </Card>

              {/* Asset Ratio */}
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs font-medium text-fg-muted" title="Assets ÷ (Assets + Liabilities). Not a true savings rate.">
                    Asset Ratio
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-1 text-xl font-semibold text-fg">
                    {assetRatio.toFixed(1)}
                    <span className="text-sm font-normal text-fg-muted">%</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>
          )}

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
                        {formatCurrency(budget.spent)} / {formatCurrency(budget.limit)}
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
                      {formatCurrency(txn.amount, { signed: true })}
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
                      ? (gainLoss / holding.costBasis) * 100
                      : 0;

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
                          {holding.quantity} shares @ {formatCurrency(holding.currentPrice)}
                        </div>
                      </div>
                      <div className="ml-4 shrink-0 text-right">
                        <div className="text-sm font-semibold text-fg">
                          {formatCurrency(holding.marketValue)}
                        </div>
                        {holding.costBasis && (
                          <div
                            className={cn(
                              "text-xs font-semibold",
                              gainLoss >= 0 ? "text-success-500" : "text-destructive-300",
                            )}
                          >
                            {formatCurrency(gainLoss, { signed: true })} ({formatPercent(gainPercent, { signed: true })})
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Financial Insights — finance subset of the unified Inbox. Renders */}
          {/* with the same Discuss / Acted / Dismiss / Snooze actions, so a   */}
          {/* miscategorized or off-base number can be challenged inline. */}
          {insights.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs uppercase tracking-wide text-fg-faint">
                Financial Insights
              </h2>
              <ul className="space-y-3">
                {insights.map((insight) => (
                  <InsightCard key={insight.id} insight={insight} />
                ))}
              </ul>
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
