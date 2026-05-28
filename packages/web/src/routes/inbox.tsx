import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { ViewHeader } from "~/components/ui/ViewHeader";
import { Button } from "~/components/ui/Button";
import { TabNav } from "~/components/ui/TabNav";
import { PaginationNav } from "~/components/ui/PaginationNav";
import { api, type InsightState } from "~/lib/api";
import { BriefingPanel } from "~/components/inbox/BriefingPanel";
import { InsightCard } from "~/components/inbox/InsightCard";
import { toast } from "~/lib/use-toast";

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
    queryFn: ({ pageParam }: { pageParam: number }) =>
      api.inbox({ state: filter, page: pageParam, limit: PAGE_SIZE }),
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
      toast.success("Insights refreshed");
    },
    onError: (err: unknown) => {
      toast.error("Could not generate insights", err instanceof Error ? err.message : String(err));
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
          <Button
            type="button"
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
            loading={generate.isPending}
            variant="secondary"
            size="sm"
          >
            <Sparkles className="size-3.5" strokeWidth={1.75} />
            Generate Insights
          </Button>
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
        <Button
          type="button"
          onClick={onGenerate}
          disabled={pending}
          loading={pending}
          variant="primary"
          size="sm"
          className="mt-2"
        >
          <Sparkles className="size-4" strokeWidth={1.75} />
          Look for new insights
        </Button>
      </div>
    );
  }
  return <p className="mt-10 text-center text-sm text-fg-muted">No {filter} insights.</p>;
};
