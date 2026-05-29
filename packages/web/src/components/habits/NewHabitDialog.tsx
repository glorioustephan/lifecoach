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
import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDown } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "~/components/ui/Button";
import { ModalShell } from "~/components/ui/ModalShell";
import { PillGroup, type PillOption } from "~/components/ui/PillGroup";
import { formControlClass } from "~/components/ui/formStyles";
import { cn } from "~/lib/cn";
import { toast } from "~/lib/use-toast";
import { api, type HabitRow } from "~/lib/api";

const CADENCE_OPTIONS: ReadonlyArray<PillOption<HabitRow["cadence"]>> = [
  { value: "daily", label: "daily" },
  { value: "weekly", label: "weekly" },
  { value: "monthly", label: "monthly" },
];

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
    <ModalShell
      open={open}
      onClose={handleClose}
      title="New habit"
      onSubmit={handleSubmit}
      footer={
        <>
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
        </>
      }
    >
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
      <PillGroup
        label="Cadence"
        options={CADENCE_OPTIONS}
        value={cadence}
        onChange={setCadence}
        capitalize
      />

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
    </ModalShell>
  );
};
