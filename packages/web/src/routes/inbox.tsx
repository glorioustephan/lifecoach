import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  MessageCircle,
  AlertCircle,
} from "lucide-react";
import { ViewHeader } from "~/components/ui/ViewHeader";
import { TabNav } from "~/components/ui/TabNav";
import { PaginationNav } from "~/components/ui/PaginationNav";
import { api, type InsightRow, type InsightState } from "~/lib/api";
import { formatRelative } from "~/lib/time";
import { cn } from "~/lib/cn";
import { Markdown } from "~/components/chat/Markdown";
import { useChatActions } from "~/components/chat/chat-state";
import { BriefingPanel } from "~/components/inbox/BriefingPanel";

export const Route = createFileRoute("/inbox")({
  component: InboxRoute,
});

const PAGE_SIZE = 25;

const PRIORITY_LABEL: Record<number, string> = {
  1: "Notice",
  2: "Worth noting",
  3: "Attention",
};

const PRIORITY_BORDER: Record<number, string> = {
  1: "border-border-subtle",
  2: "border-warning-500/40",
  3: "border-destructive-500/40",
};

const PRIORITY_BADGE: Record<number, string> = {
  1: "bg-surface-elevated text-fg-faint",
  2: "bg-warning-500/10 text-warning-200",
  3: "bg-destructive-500/10 text-destructive-300",
};

function InboxRoute(): JSX.Element {
  const [filter, setFilter] = useState<InsightState>("active");
  const [page, setPage] = useState(1);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["inbox", filter, page],
    queryFn: async () => {
      const resp = await fetch(
        `/api/inbox?state=${filter}&page=${page}&limit=${PAGE_SIZE}`
      );
      if (!resp.ok) throw new Error(resp.statusText);
      return resp.json() as Promise<{ insights: InsightRow[]; total: number }>;
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
    setPage(1);
  };

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);
  const itemsShown = data?.insights.length ?? 0;
  const totalItems = data?.total ?? 0;

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
                {data!.insights.map((insight) => (
                  <InsightCard key={insight.id} insight={insight} />
                ))}
              </ul>
              <div className="mt-6">
                <PaginationNav
                  currentPage={page}
                  totalPages={totalPages}
                  itemsShown={itemsShown}
                  totalItems={totalItems}
                  onLoadMore={() => setPage(page + 1)}
                  isLoading={isLoading}
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

function InsightCard({ insight }: { insight: InsightRow }): JSX.Element {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { reset } = useChatActions();

  const act = useMutation({
    mutationFn: () => api.actInsight(insight.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["inbox"] }),
  });
  const dismiss = useMutation({
    mutationFn: () => api.dismissInsight(insight.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["inbox"] }),
  });
  const snooze = useMutation({
    mutationFn: (until: string) => api.snoozeInsight(insight.id, until),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["inbox"] }),
  });
  const reactivate = useMutation({
    mutationFn: () => api.reactivateInsight(insight.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["inbox"] }),
  });

  const isClosed = !!(insight.actedOnAt || insight.dismissedAt);
  const isSnoozed = !!(insight.snoozedUntil && insight.snoozedUntil > Date.now());

  const handleDiscuss = (): void => {
    // Pre-seed a fresh chat session with the insight context.
    const seed = `Let's discuss this insight: **${insight.topic}**\n\n${insight.body}${
      insight.rationale ? `\n\n_${insight.rationale}_` : ""
    }`;
    reset({
      sessionId: undefined,
      items: [
        {
          kind: "message",
          id: `seed-${insight.id}`,
          role: "user",
          content: seed,
        },
      ],
    });
    void navigate({ to: "/" });
  };

  return (
    <li
      className={cn(
        "rounded-md border bg-surface p-4 transition-opacity",
        PRIORITY_BORDER[insight.priority],
        isClosed && "opacity-60",
      )}
    >
      <header className="mb-2 flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-fg">{insight.topic}</h2>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
              PRIORITY_BADGE[insight.priority],
            )}
          >
            {PRIORITY_LABEL[insight.priority]}
          </span>
          <span className="font-mono text-[10px] text-fg-faint">
            {formatRelative(insight.createdAt)}
          </span>
        </div>
      </header>

      <div className="text-sm text-fg">
        <Markdown>{insight.body}</Markdown>
      </div>

      {insight.rationale && (
        <p className="mt-3 text-xs text-fg-muted">
          <span className="text-fg-faint">why now:</span> {insight.rationale}
        </p>
      )}

      {isSnoozed && (
        <p className="mt-3 text-xs text-fg-faint">
          snoozed until {new Date(insight.snoozedUntil!).toLocaleString()}
        </p>
      )}

      <footer className="mt-4 flex flex-wrap items-center gap-1">
        {!isClosed ? (
          <>
            <ActionButton
              icon={<MessageCircle className="size-3.5" strokeWidth={1.75} />}
              label="Discuss"
              onClick={handleDiscuss}
              variant="primary"
            />
            <ActionButton
              icon={<CheckCircle2 className="size-3.5" strokeWidth={1.75} />}
              label="Acted"
              onClick={() => act.mutate()}
              pending={act.isPending}
            />
            <ActionButton
              icon={<XCircle className="size-3.5" strokeWidth={1.75} />}
              label="Dismiss"
              onClick={() => dismiss.mutate()}
              pending={dismiss.isPending}
            />
            <SnoozeMenu onSnooze={(until) => snooze.mutate(until)} pending={snooze.isPending} />
          </>
        ) : (
          <ActionButton
            icon={<AlertCircle className="size-3.5" strokeWidth={1.75} />}
            label="Reactivate"
            onClick={() => reactivate.mutate()}
            pending={reactivate.isPending}
          />
        )}
      </footer>
    </li>
  );
}

const ActionButton = ({
  icon,
  label,
  onClick,
  pending,
  variant,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  pending?: boolean;
  variant?: "primary";
}): JSX.Element => (
  <button
    type="button"
    onClick={onClick}
    disabled={pending}
    className={cn(
      "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors",
      variant === "primary"
        ? "text-accent hover:bg-accent/10"
        : "text-fg-muted hover:bg-surface-elevated/60 hover:text-fg",
      pending && "opacity-60",
    )}
  >
    {icon}
    {label}
  </button>
);

function SnoozeMenu({
  onSnooze,
  pending,
}: {
  onSnooze: (until: string) => void;
  pending: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const options: Array<{ label: string; value: string }> = [
    { label: "Tomorrow", value: "tomorrow" },
    { label: "In 3 days", value: "+3d" },
    { label: "Next week", value: "next week" },
  ];
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors",
          "text-fg-muted hover:bg-surface-elevated/60 hover:text-fg",
          pending && "opacity-60",
        )}
      >
        <Clock className="size-3.5" strokeWidth={1.75} />
        Snooze
      </button>
      {open && (
        <div
          className="absolute bottom-full left-0 z-10 mb-1 min-w-[140px] rounded-md border border-border bg-surface-elevated p-1 shadow-lg"
          onMouseLeave={() => setOpen(false)}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onSnooze(o.value);
                setOpen(false);
              }}
              className="block w-full rounded px-2.5 py-1.5 text-left text-xs text-fg-muted hover:bg-surface hover:text-fg"
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
