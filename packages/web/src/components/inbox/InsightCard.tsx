/**
 * Shared insight card with the full Inbox lifecycle: Discuss → seed a fresh
 * chat session, Acted, Dismiss, Snooze, Reactivate. Used by both the Inbox
 * route and the Finances page (since financial insights are now the
 * finance-subset of the unified Insighter, they share this exact UI).
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  MessageCircle,
  XCircle,
} from "lucide-react";
import { api, type InsightRow } from "~/lib/api";
import { Markdown } from "~/components/chat/Markdown";
import { useChatActions } from "~/components/chat/chat-state";
import { formatRelative } from "~/lib/time";
import { cn } from "~/lib/cn";
import { toast } from "~/lib/use-toast";

export const PRIORITY_LABEL: Record<number, string> = {
  1: "Notice",
  2: "Worth noting",
  3: "Attention",
};

export const PRIORITY_BORDER: Record<number, string> = {
  1: "border-border-subtle",
  2: "border-warning-500/40",
  3: "border-destructive-500/40",
};

export const PRIORITY_BADGE: Record<number, string> = {
  1: "bg-surface-elevated text-fg-faint",
  2: "bg-warning-500/10 text-warning-200",
  3: "bg-destructive-500/10 text-destructive-300",
};

export function InsightCard({ insight }: { insight: InsightRow }): JSX.Element {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { reset } = useChatActions();

  // Both the Inbox (queryKey ["inbox", …]) and the Finances page
  // (queryKey ["finances", "insights"]) render insights through this card.
  // Invalidate both query trees so a dismiss/act/snooze on the Finances page
  // actually disappears from the list — and surface a toast so the action
  // has visible feedback.
  const invalidateInsightQueries = (): void => {
    void qc.invalidateQueries({ queryKey: ["inbox"] });
    void qc.invalidateQueries({ queryKey: ["finances", "insights"] });
  };
  const onMutationError = (label: string) => (err: unknown): void => {
    toast.error(label, err instanceof Error ? err.message : String(err));
  };

  const act = useMutation({
    mutationFn: () => api.actInsight(insight.id),
    onSuccess: () => {
      invalidateInsightQueries();
      toast.success("Marked as acted", insight.topic);
    },
    onError: onMutationError("Could not mark acted"),
  });
  const dismiss = useMutation({
    mutationFn: () => api.dismissInsight(insight.id),
    onSuccess: () => {
      invalidateInsightQueries();
      toast.success("Insight dismissed", insight.topic);
    },
    onError: onMutationError("Could not dismiss"),
  });
  const snooze = useMutation({
    mutationFn: (until: number) => api.snoozeInsight(insight.id, until),
    onSuccess: (_data, until) => {
      invalidateInsightQueries();
      toast.success("Snoozed", `Until ${new Date(until).toLocaleString()}`);
    },
    onError: onMutationError("Could not snooze"),
  });
  const reactivate = useMutation({
    mutationFn: () => api.reactivateInsight(insight.id),
    onSuccess: () => {
      invalidateInsightQueries();
      toast.success("Reactivated", insight.topic);
    },
    onError: onMutationError("Could not reactivate"),
  });

  const isClosed = !!(insight.actedOnAt || insight.dismissedAt);
  const isSnoozed = !!(insight.snoozedUntil && insight.snoozedUntil > Date.now());

  const handleDiscuss = (): void => {
    // Queue the insight context as a pending user submission so ChatView
    // actually sends it to the backend on mount. Previously this was placed
    // into items as a fake user message, which only existed client-side —
    // the agent never saw it and the user's reply landed without context.
    const seed = `Let's discuss this insight: **${insight.topic}**\n\n${insight.body}${
      insight.rationale ? `\n\n_${insight.rationale}_` : ""
    }`;
    reset({
      sessionId: undefined,
      items: [],
      pendingSubmit: seed,
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

      {(act.isError || dismiss.isError || snooze.isError || reactivate.isError) && (
        <p className="mt-2 text-xs text-destructive-300">
          {act.isError && (act.error instanceof Error ? act.error.message : "Failed to mark acted")}
          {dismiss.isError && (dismiss.error instanceof Error ? dismiss.error.message : "Failed to dismiss")}
          {snooze.isError && (snooze.error instanceof Error ? snooze.error.message : "Failed to snooze")}
          {reactivate.isError && (reactivate.error instanceof Error ? reactivate.error.message : "Failed to reactivate")}
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
  onSnooze: (until: number) => void;
  pending: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const options: Array<{ label: string; getUntil: () => number }> = [
    { label: "Tomorrow", getUntil: () => Date.now() + 24 * 60 * 60 * 1000 },
    { label: "In 3 days", getUntil: () => Date.now() + 3 * 24 * 60 * 60 * 1000 },
    { label: "Next week", getUntil: () => Date.now() + 7 * 24 * 60 * 60 * 1000 },
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
              key={o.label}
              type="button"
              onClick={() => {
                onSnooze(o.getUntil());
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
