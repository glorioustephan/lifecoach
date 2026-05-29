/**
 * CreateFromInsightDialog — turn an inbox card into a Goal, Habit, or Task.
 *
 * Creating an entity atomically marks the source insight "acted" with
 * provenance (server-side, single transaction), so the card moves to the Acted
 * tab and shows what it produced. This is what gives "Acted" a concrete meaning
 * distinct from "Dismiss".
 *
 * Design principles cited inline:
 *  ADHD-2: Progressive disclosure — title + one type-specific field is the
 *          entire floor; the title is pre-filled from the insight topic.
 *  ADHD-6: Quick reversal — success toast includes a "View" CTA.
 *  ADHD-9: One required field — title is the only required input; kind/cadence
 *          default so the CTA is reachable immediately.
 *  ADHD-10: Predictable surfaces — mirrors NewHabitDialog's structure exactly.
 */
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "~/components/ui/Button";
import { formControlClass } from "~/components/ui/formStyles";
import { cn } from "~/lib/cn";
import { toast } from "~/lib/use-toast";
import {
  api,
  type CreateEntityFromInsightBody,
  type GoalKind,
  type HabitRow,
  type InsightRow,
} from "~/lib/api";

type EntityType = "goal" | "habit" | "task";

const TYPE_OPTIONS: Array<{ value: EntityType; label: string }> = [
  { value: "goal", label: "Goal" },
  { value: "habit", label: "Habit" },
  { value: "task", label: "Task" },
];

const GOAL_KINDS: Array<{ value: GoalKind; label: string }> = [
  { value: "outcome", label: "Outcome" },
  { value: "process", label: "Process" },
  { value: "identity", label: "Identity" },
];

const CADENCES: Array<HabitRow["cadence"]> = ["daily", "weekly", "monthly"];

const ROUTE_BY_TYPE: Record<EntityType, "/goals" | "/habits" | "/tasks"> = {
  goal: "/goals",
  habit: "/habits",
  task: "/tasks",
};

interface CreateFromInsightDialogProps {
  open: boolean;
  onClose: () => void;
  insight: InsightRow;
}

export const CreateFromInsightDialog = ({
  open,
  onClose,
  insight,
}: CreateFromInsightDialogProps): JSX.Element => {
  const qc = useQueryClient();
  const navigate = useNavigate();

  // Default to Habit — the most common structural follow-up from an insight.
  const [type, setType] = useState<EntityType>("habit");
  // ADHD-2: title pre-filled from the insight topic so the floor is zero keystrokes.
  const [title, setTitle] = useState(insight.topic);
  const [kind, setKind] = useState<GoalKind>("outcome");
  const [cadence, setCadence] = useState<HabitRow["cadence"]>("daily");
  const [dueAt, setDueAt] = useState("");

  // The dialog is mounted only while open (InsightCard gates it), so each open
  // is a fresh mount that re-seeds the state above — no manual reset needed.
  const handleClose = onClose;

  const createMut = useMutation({
    mutationFn: () => {
      const trimmed = title.trim();
      let body: CreateEntityFromInsightBody;
      if (type === "goal") {
        body = { type: "goal", title: trimmed, kind };
      } else if (type === "habit") {
        body = { type: "habit", title: trimmed, cadence };
      } else {
        body = {
          type: "task",
          title: trimmed,
          ...(dueAt ? { dueAt: new Date(dueAt).getTime() } : {}),
        };
      }
      return api.createEntityFromInsight(insight.id, body);
    },
    onSuccess: (result) => {
      // The card was acted server-side — refresh both inbox surfaces so it
      // moves to the Acted tab, plus the destination list and the rail counts
      // (["status"]) that track active task / insight totals.
      void qc.invalidateQueries({ queryKey: ["inbox"] });
      void qc.invalidateQueries({ queryKey: ["finances", "insights"] });
      void qc.invalidateQueries({ queryKey: [`${result.type}s`] });
      void qc.invalidateQueries({ queryKey: ["status"] });

      // ADHD-6: quick reversal / forward navigation via a View CTA.
      toast({
        title: `Created ${result.type}`,
        description: insight.topic,
        variant: "success",
        action: {
          label: "View",
          onClick: () => void navigate({ to: ROUTE_BY_TYPE[result.type] }),
        },
      });
      handleClose();
    },
    onError: (err: unknown) => {
      toast.error("Couldn't create", err instanceof Error ? err.message : String(err));
    },
  });

  const canSubmit = title.trim().length > 0 && !createMut.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    createMut.mutate();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-bg/80 backdrop-blur-[1px]" />
        <Dialog.Content
          className="fixed inset-0 z-50 flex items-center justify-center p-4 outline-none"
          onClick={handleClose}
        >
          <form
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "flex w-full max-w-md flex-col rounded-xl",
              "border border-border bg-surface shadow-2xl",
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <Dialog.Title className="text-base font-semibold text-fg">
                Create from this insight
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                Create a goal, habit, or task seeded from this inbox insight. The
                insight is marked acted once the item is created.
              </Dialog.Description>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close"
                className="flex size-7 items-center justify-center rounded-md text-fg-faint hover:bg-surface-elevated hover:text-fg"
              >
                <X className="size-4" strokeWidth={1.75} />
              </button>
            </div>

            {/* Body */}
            <div className="space-y-4 px-5 py-4">
              {/* Type selector */}
              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-fg-muted">Type</span>
                <div className="flex gap-2">
                  {TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setType(opt.value)}
                      aria-pressed={type === opt.value}
                      className={cn(
                        "flex-1 rounded-md border py-2 text-xs transition-colors",
                        type === opt.value
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border-subtle text-fg-muted hover:bg-surface-elevated hover:text-fg",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title — the one required field (ADHD-9). */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-fg-muted" htmlFor="create-insight-title">
                  Title
                </label>
                <input
                  id="create-insight-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What do you want to create?"
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  required
                  className={formControlClass("w-full px-3 py-2 text-sm")}
                />
              </div>

              {/* Type-specific field */}
              {type === "goal" && (
                <div className="space-y-1.5">
                  <span className="block text-xs font-medium text-fg-muted">Kind</span>
                  <div className="flex gap-2">
                    {GOAL_KINDS.map((k) => (
                      <button
                        key={k.value}
                        type="button"
                        onClick={() => setKind(k.value)}
                        aria-pressed={kind === k.value}
                        className={cn(
                          "flex-1 rounded-md border py-2 text-xs transition-colors",
                          kind === k.value
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-border-subtle text-fg-muted hover:bg-surface-elevated hover:text-fg",
                        )}
                      >
                        {k.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {type === "habit" && (
                <div className="space-y-1.5">
                  <span className="block text-xs font-medium text-fg-muted">Cadence</span>
                  <div className="flex gap-2">
                    {CADENCES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCadence(c)}
                        aria-pressed={cadence === c}
                        className={cn(
                          "flex-1 rounded-md border py-2 text-xs capitalize transition-colors",
                          cadence === c
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-border-subtle text-fg-muted hover:bg-surface-elevated hover:text-fg",
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {type === "task" && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-fg-muted" htmlFor="create-insight-due">
                    Due date (optional)
                  </label>
                  <input
                    id="create-insight-due"
                    type="date"
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                    className={formControlClass("w-full px-3 py-2 text-sm")}
                  />
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleClose}
                disabled={createMut.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={!canSubmit}
                loading={createMut.isPending}
              >
                Create {type}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
