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
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "~/components/ui/Button";
import { ModalShell } from "~/components/ui/ModalShell";
import { PillGroup, type PillOption } from "~/components/ui/PillGroup";
import { formControlClass } from "~/components/ui/formStyles";
import { toast } from "~/lib/use-toast";
import {
  api,
  type CreateEntityFromInsightBody,
  type GoalKind,
  type HabitRow,
  type InsightRow,
} from "~/lib/api";

type EntityType = "goal" | "habit" | "task";

const TYPE_OPTIONS: ReadonlyArray<PillOption<EntityType>> = [
  { value: "goal", label: "Goal" },
  { value: "habit", label: "Habit" },
  { value: "task", label: "Task" },
];

const GOAL_KINDS: ReadonlyArray<PillOption<GoalKind>> = [
  { value: "outcome", label: "Outcome" },
  { value: "process", label: "Process" },
  { value: "identity", label: "Identity" },
];

const CADENCE_OPTIONS: ReadonlyArray<PillOption<HabitRow["cadence"]>> = [
  { value: "daily", label: "daily" },
  { value: "weekly", label: "weekly" },
  { value: "monthly", label: "monthly" },
];

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
    <ModalShell
      open={open}
      onClose={handleClose}
      title="Create from this insight"
      description="Create a goal, habit, or task seeded from this inbox insight. The insight is marked acted once the item is created."
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
          <Button type="submit" variant="primary" size="sm" disabled={!canSubmit} loading={createMut.isPending}>
            Create {type}
          </Button>
        </>
      }
    >
      <PillGroup label="Type" options={TYPE_OPTIONS} value={type} onChange={setType} />

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
        <PillGroup label="Kind" options={GOAL_KINDS} value={kind} onChange={setKind} />
      )}
      {type === "habit" && (
        <PillGroup label="Cadence" options={CADENCE_OPTIONS} value={cadence} onChange={setCadence} capitalize />
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
    </ModalShell>
  );
};
