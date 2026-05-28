import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, Plus, Trash2 } from "lucide-react";
import { Button } from "~/components/ui/Button";
import { api, type GoalRow, type MilestoneRow } from "~/lib/api";
import { cn } from "~/lib/cn";

/**
 * Milestones tab of the GoalEditSheet — linear-ordered list with add,
 * complete, and delete. Extracted from GoalEditSheet.tsx (Wave 5.4).
 */
export function MilestonesTab({ goal }: { goal: GoalRow }): JSX.Element {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["goals", goal.id, "milestones"],
    queryFn: () => api.goalMilestones(goal.id),
  });

  const [newTitle, setNewTitle] = useState("");

  const createMut = useMutation({
    mutationFn: (title: string) => api.createMilestone(goal.id, { title }),
    onSuccess: () => {
      setNewTitle("");
      void qc.invalidateQueries({ queryKey: ["goals", goal.id, "milestones"] });
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: MilestoneRow["status"] }) =>
      api.updateMilestone(goal.id, id, { status }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["goals", goal.id, "milestones"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteMilestone(goal.id, id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["goals", goal.id, "milestones"] }),
  });

  const milestones = data?.milestones ?? [];
  const done = milestones.filter((m) => m.status === "done").length;

  return (
    <div className="space-y-4 p-4 md:p-6">
      {milestones.length > 0 && (
        <p className="text-xs text-fg-faint">
          {done} of {milestones.length} complete
        </p>
      )}

      {isLoading && (
        <ul className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <li
              key={i}
              className="h-10 animate-pulse rounded-md border border-border-subtle bg-surface/50"
            />
          ))}
        </ul>
      )}

      {!isLoading && milestones.length === 0 && (
        <p className="text-xs text-fg-faint">
          No milestones yet. Break this goal into 2–5 concrete checkpoints.
        </p>
      )}

      {!isLoading && milestones.length > 0 && (
        <ul className="space-y-1.5">
          {milestones.map((m) => (
            <li
              key={m.id}
              className="group flex items-start gap-2 rounded-md border border-border-subtle bg-surface px-3 py-2"
            >
              <button
                type="button"
                onClick={() =>
                  toggleMut.mutate({
                    id: m.id,
                    status: m.status === "done" ? "pending" : "done",
                  })
                }
                aria-label={
                  m.status === "done" ? `Mark ${m.title} as pending` : `Complete ${m.title}`
                }
                className="mt-0.5 text-fg-faint hover:text-accent"
              >
                {m.status === "done" ? (
                  <CheckCircle2 className="size-4 text-success-500" strokeWidth={1.75} />
                ) : (
                  <Circle className="size-4" strokeWidth={1.75} />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-sm",
                    m.status === "done" ? "text-fg-faint line-through" : "text-fg",
                  )}
                >
                  {m.title}
                </p>
                {m.dueAt && (
                  <p className="text-[10px] font-mono text-fg-faint">
                    due {new Date(m.dueAt).toISOString().slice(0, 10)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => deleteMut.mutate(m.id)}
                aria-label={`Delete ${m.title}`}
                className="text-fg-faint opacity-0 transition-opacity hover:text-destructive-300 group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" strokeWidth={1.75} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const t = newTitle.trim();
          if (t.length === 0) return;
          createMut.mutate(t);
        }}
        className="flex items-center gap-2 border-t border-border-subtle pt-4"
      >
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a milestone…"
          className="flex-1 rounded-md border border-border-subtle bg-surface-elevated px-3 py-1.5 text-sm text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent"
        />
        <Button
          variant="secondary"
          size="sm"
          type="submit"
          disabled={newTitle.trim().length === 0 || createMut.isPending}
          loading={createMut.isPending}
        >
          <Plus className="size-3.5" strokeWidth={1.75} />
          Add
        </Button>
      </form>
    </div>
  );
}
