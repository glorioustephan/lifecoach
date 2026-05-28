import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { ViewHeader } from "~/components/ui/ViewHeader";
import { TabNav } from "~/components/ui/TabNav";
import { PaginationNav } from "~/components/ui/PaginationNav";
import { api, type InsightRow, type InsightState } from "~/lib/api";
import { cn } from "~/lib/cn";
import { BriefingPanel } from "~/components/inbox/BriefingPanel";
import { InsightCard } from "~/components/inbox/InsightCard";

export const Route = createFileRoute("/inbox")({
  component: InboxRoute,
});

const PAGE_SIZE = 25;

function InboxRoute(): JSX.Element {
  const [filter, setFilter] = useState<InsightState>("active");
  const qc = useQueryClient();

  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: ["inbox", filter],
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const resp = await fetch(
        `/api/inbox?state=${filter}&page=${pageParam}&limit=${PAGE_SIZE}`
      );
      if (!resp.ok) throw new Error(resp.statusText);
      return resp.json() as Promise<{ insights: InsightRow[]; total: number }>;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, p) => n + p.insights.length, 0);
      return loaded < lastPage.total ? allPages.length + 1 : undefined;
    },
    refetchInterval: filter === "active" ? 60_000 : false,
  });

  const generate = useMutation({
    mutationFn: () => api.generateInsights(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["inbox"] });
      void qc.invalidateQueries({ queryKey: ["status"] });
    },
  });

  const handleFilterChange = (newFilter: InsightState): void => {
    setFilter(newFilter);
  };

  const allInsights = data?.pages.flatMap((p) => p.insights) ?? [];
  const totalItems = data?.pages[0]?.total ?? 0;
  const currentPage = data?.pages.length ?? 1;
  const totalPages = Math.ceil(totalItems / PAGE_SIZE);
  const itemsShown = allInsights.length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewHeader
        title="Inbox"
        subtitle="Background-intelligence surfaces — your morning ritual"
        actions={
          <button
            type="button"
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md border border-border-subtle px-3 text-xs transition-colors",
              generate.isPending
                ? "border-accent/40 bg-accent/10 text-accent"
                : "text-fg-muted hover:border-accent/40 hover:bg-surface-elevated hover:text-fg",
            )}
          >
            <Sparkles className="size-3.5" strokeWidth={1.75} />
            {generate.isPending ? "generating…" : "Generate Insights"}
          </button>
        }
      />
      <div className="flex-1 overflow-y-auto mobile-safe-bottom">
        <TabNav
          tabs={[
            { id: "active" as const, label: "Active" },
            { id: "snoozed" as const, label: "Snoozed" },
            { id: "acted" as const, label: "Acted" },
            { id: "dismissed" as const, label: "Dismissed" },
          ]}
          active={filter}
          onChange={handleFilterChange}
          variant="underline"
        />

        {generate.isError && (
          <div className="mx-auto mt-3 w-full max-w-2xl px-4 md:px-6">
            <div className="rounded-md border border-destructive-500/40 bg-destructive-500/5 px-3 py-2 text-xs text-destructive-300">
              {generate.error instanceof Error ? generate.error.message : "Generation failed"}
            </div>
          </div>
        )}

        <div className="mx-auto max-w-2xl space-y-4 px-4 py-4 md:px-6">
          {filter === "active" && <BriefingPanel />}

          {isLoading && (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-32 animate-pulse rounded-md border border-border-subtle bg-surface/50"
                />
              ))}
            </div>
          )}

          {!isLoading && totalItems === 0 && (
            <EmptyState
              filter={filter}
              onGenerate={() => generate.mutate()}
              pending={generate.isPending}
            />
          )}

          {!isLoading && totalItems > 0 && (
            <>
              <ul className="space-y-3">
                {allInsights.map((insight) => (
                  <InsightCard key={insight.id} insight={insight} />
                ))}
              </ul>
              <div className="mt-6">
                <PaginationNav
                  currentPage={currentPage}
                  totalPages={totalPages}
                  itemsShown={itemsShown}
                  totalItems={totalItems}
                  onLoadMore={() => void fetchNextPage()}
                  isLoading={isFetchingNextPage}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const EmptyState = ({
  filter,
  onGenerate,
  pending,
}: {
  filter: InsightState;
  onGenerate: () => void;
  pending: boolean;
}): JSX.Element => {
  if (filter === "active") {
    return (
      <div className="mt-10 flex flex-col items-center gap-3 text-center">
        <Sparkles className="size-8 text-fg-faint" strokeWidth={1.5} />
        <p className="text-sm text-fg-muted">Nothing in your inbox right now.</p>
        <p className="max-w-sm text-xs text-fg-faint">
          The coach will surface patterns, anomalies, and opportunities here. Run
          the insight pass to look for new ones.
        </p>
        <button
          type="button"
          onClick={onGenerate}
          disabled={pending}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-400 disabled:opacity-60"
        >
          <Sparkles className="size-4" strokeWidth={1.75} />
          {pending ? "thinking…" : "Look for new insights"}
        </button>
      </div>
    );
  }
  return <p className="mt-10 text-center text-sm text-fg-muted">No {filter} insights.</p>;
};

