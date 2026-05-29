/**
 * NewHabitDialog — create a habit with minimal friction.
 *
 * ADHD-2: Progressive disclosure — title + cadence is the entire required
 *         floor. Parent goal, notes, and advanced options are hidden behind
 *         "More options" so the creation path is one decision at a time.
 * ADHD-9: One required field per step — title is the only required field;
 *         cadence defaults to "daily" so the user can tap Create immediately.
 */
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDown, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "~/components/ui/Button";
import { formControlClass } from "~/components/ui/formStyles";
import { cn } from "~/lib/cn";
import { toast } from "~/lib/use-toast";
import { api, type HabitRow } from "~/lib/api";

interface NewHabitDialogProps {
  open: boolean;
  onClose: () => void;
  /** Pre-fill parentGoalId when opened from a goal's Habits tab. */
  defaultParentGoalId?: string;
}

export const NewHabitDialog = ({
  open,
  onClose,
  defaultParentGoalId,
}: NewHabitDialogProps): JSX.Element => {
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [cadence, setCadence] = useState<HabitRow["cadence"]>("daily");
  const [moreOpen, setMoreOpen] = useState(false);
  const [parentGoalId, setParentGoalId] = useState(defaultParentGoalId ?? "");
  const [notes, setNotes] = useState("");

  const { data: goalsData } = useQuery({
    queryKey: ["goals", "active"],
    queryFn: () => api.goals("active"),
    staleTime: 30_000,
    enabled: moreOpen, // only fetch when the user opens "More options"
  });
  const goals = goalsData?.goals ?? [];

  const createMut = useMutation({
    mutationFn: () =>
      api.createHabit({
        title: title.trim(),
        cadence,
        ...(parentGoalId ? { parentGoalId } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      }),
    onSuccess: (data) => {
      toast.success(`Created "${data.habit.title}"`);
      void qc.invalidateQueries({ queryKey: ["habits"] });
      handleClose();
    },
    onError: (err: unknown) => {
      toast.error("Couldn't create habit", err instanceof Error ? err.message : String(err));
    },
  });

  const handleClose = () => {
    setTitle("");
    setCadence("daily");
    setMoreOpen(false);
    setParentGoalId(defaultParentGoalId ?? "");
    setNotes("");
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || createMut.isPending) return;
    createMut.mutate();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-bg/80 backdrop-blur-[1px]" />
        <Dialog.Content
          className={cn(
            "fixed inset-0 z-50 flex items-center justify-center p-4 outline-none",
          )}
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
                New habit
              </Dialog.Title>
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
            <div className="px-5 py-4 space-y-4">
              {/* Title — the one required field (ADHD-2: floor is just title). */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-fg-muted" htmlFor="new-habit-title">
                  Title
                </label>
                <input
                  id="new-habit-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Take fish oil with lunch"
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  required
                  className={formControlClass("w-full px-3 py-2 text-sm")}
                />
              </div>

              {/* Cadence — second required field, defaults to "daily" so the CTA is always reachable. */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-fg-muted" htmlFor="new-habit-cadence">
                  Cadence
                </label>
                <div className="flex gap-2">
                  {(["daily", "weekly", "monthly"] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCadence(c)}
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

              {/* ADHD-2: More options — collapsed by default. */}
              <Collapsible.Root open={moreOpen} onOpenChange={setMoreOpen}>
                <Collapsible.Trigger className="flex items-center gap-1.5 text-xs text-fg-faint transition-colors hover:text-fg-muted">
                  <ChevronDown
                    className={cn("size-3.5 transition-transform", moreOpen && "rotate-180")}
                    strokeWidth={1.75}
                  />
                  More options
                </Collapsible.Trigger>
                <Collapsible.Content className="mt-3 space-y-3">
                  {/* Parent goal */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-fg-muted" htmlFor="new-habit-goal">
                      Parent goal (optional)
                    </label>
                    <select
                      id="new-habit-goal"
                      value={parentGoalId}
                      onChange={(e) => setParentGoalId(e.target.value)}
                      className={formControlClass("w-full px-2 py-1.5 text-sm")}
                    >
                      <option value="">None (stand-alone habit)</option>
                      {goals.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Notes */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-fg-muted" htmlFor="new-habit-notes">
                      Notes (optional)
                    </label>
                    <textarea
                      id="new-habit-notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      placeholder="Any context — dose, timing, cues…"
                      className={formControlClass("w-full resize-none px-3 py-2 text-sm")}
                    />
                  </div>
                </Collapsible.Content>
              </Collapsible.Root>
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
                disabled={!title.trim() || createMut.isPending}
                loading={createMut.isPending}
              >
                Create habit
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
