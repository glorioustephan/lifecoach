import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "~/components/ui/Button";
import { formControlClass } from "~/components/ui/formStyles";
import { api, type GoalRow } from "~/lib/api";
import { formatRelative } from "~/lib/time";

const ORIGIN_LABEL: Record<"manual" | "conversation" | "cron", string> = {
  manual: "you",
  conversation: "chat",
  cron: "system",
};

/**
 * Evidence tab of the GoalEditSheet — log evidence rows that show the goal
 * is moving. Extracted from GoalEditSheet.tsx (Wave 5.4). Uses the shared
 * `formatRelative` helper rather than a private formatRelativeTime
 * duplicate.
 */
export function EvidenceTab({ goal }: { goal: GoalRow }): JSX.Element {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["goals", goal.id, "evidence"],
    queryFn: () => api.goalEvidence(goal.id),
  });

  const [body, setBody] = useState("");

  const createMut = useMutation({
    mutationFn: (text: string) => api.createGoalEvidence(goal.id, { body: text }),
    onSuccess: () => {
      setBody("");
      void qc.invalidateQueries({ queryKey: ["goals", goal.id, "evidence"] });
      // The server also stamps last_reviewed_at, so refresh the goal list.
      void qc.invalidateQueries({ queryKey: ["goals"] });
    },
  });

  const evidence = data?.evidence ?? [];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const text = body.trim();
          if (text.length === 0) return;
          createMut.mutate(text);
        }}
        className="space-y-2 rounded-md border border-border-subtle bg-surface px-3 py-3"
      >
        <label className="text-[11px] uppercase tracking-wide text-fg-muted">
          Log evidence
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="What happened that bears on this goal?"
          className={formControlClass("w-full resize-none px-3 py-2 text-sm")}
        />
        <div className="flex justify-end">
          <Button
            variant="secondary"
            size="sm"
            type="submit"
            disabled={body.trim().length === 0 || createMut.isPending}
            loading={createMut.isPending}
          >
            <Plus className="size-3.5" strokeWidth={1.75} />
            Log
          </Button>
        </div>
      </form>

      {isLoading && (
        <ul className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <li
              key={i}
              className="h-12 animate-pulse rounded-md border border-border-subtle bg-surface/50"
            />
          ))}
        </ul>
      )}

      {!isLoading && evidence.length === 0 && (
        <p className="text-xs text-fg-faint">
          No evidence yet. Log a moment of progress above, or mention this goal
          in chat — the coach can capture evidence automatically.
        </p>
      )}

      {!isLoading && evidence.length > 0 && (
        <ul className="space-y-1.5">
          {evidence.map((e) => (
            <li
              key={e.id}
              className="rounded-md border border-border-subtle bg-surface px-3 py-2"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="min-w-0 flex-1 text-sm text-fg whitespace-pre-wrap">
                  {e.body}
                </p>
                <span className="shrink-0 rounded-sm bg-surface-elevated px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-fg-faint">
                  {ORIGIN_LABEL[e.origin]}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[10px] font-mono text-fg-faint">
                <span>{formatRelative(e.recordedAt)}</span>
                {e.delta !== null && e.delta !== undefined && (
                  <span className="text-fg-muted">
                    {e.delta > 0 ? "+" : ""}
                    {e.delta}
                  </span>
                )}
                {e.sourceRefType && e.sourceRefType !== "manual" && (
                  <span>from {e.sourceRefType}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
