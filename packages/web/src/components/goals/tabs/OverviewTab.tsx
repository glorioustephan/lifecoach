import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "~/components/ui/Button";
import {
  api,
  type GoalCadence,
  type GoalKind,
  type GoalReviewCadence,
  type GoalRow,
} from "~/lib/api";
import { cn } from "~/lib/cn";
import { toast } from "~/lib/use-toast";
import { Field, HORIZON_LABEL, KIND_HINT, KIND_LABEL } from "../_shared";
import { SignalsSection } from "../SignalsSection";

/**
 * Overview tab of the GoalEditSheet — every WOOP / kind / cadence / horizon
 * field plus the archive + complete actions. Extracted from
 * GoalEditSheet.tsx (Wave 5.4) so the sheet stays a thin router.
 */
export function OverviewTab({
  goal,
  onClose,
}: {
  goal: GoalRow;
  onClose: () => void;
}): JSX.Element {
  const qc = useQueryClient();
  const [title, setTitle] = useState(goal.title);
  const [kind, setKind] = useState<GoalKind>(goal.kind);
  const [cadence, setCadence] = useState<GoalCadence | "">(goal.cadence ?? "");
  const [horizon, setHorizon] = useState<GoalRow["horizon"]>(goal.horizon);
  const [reviewCadence, setReviewCadence] = useState<GoalReviewCadence>(goal.reviewCadence);
  const [outcome, setOutcome] = useState(goal.outcome ?? "");
  const [obstacle, setObstacle] = useState(goal.obstacle ?? "");
  const [implementationIntention, setImplementationIntention] = useState(
    goal.implementationIntention ?? "",
  );
  const [identityStatement, setIdentityStatement] = useState(goal.identityStatement ?? "");
  const [dueAtStr, setDueAtStr] = useState(
    goal.dueAt ? new Date(goal.dueAt).toISOString().slice(0, 10) : "",
  );

  const saveMut = useMutation({
    mutationFn: () =>
      api.updateGoal(goal.id, {
        title: title.trim(),
        kind,
        cadence: kind === "process" ? (cadence || null) : null,
        horizon,
        reviewCadence,
        outcome: outcome.trim() ? outcome.trim() : null,
        obstacle: obstacle.trim() ? obstacle.trim() : null,
        implementationIntention: implementationIntention.trim()
          ? implementationIntention.trim()
          : null,
        identityStatement: identityStatement.trim() ? identityStatement.trim() : null,
        dueAt: dueAtStr ? new Date(dueAtStr + "T00:00:00Z").getTime() : null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["goals"] });
      toast.success("Goal saved", title.trim());
    },
    onError: (err: unknown) => {
      toast.error("Save failed", err instanceof Error ? err.message : String(err));
    },
  });

  const archiveMut = useMutation({
    mutationFn: () => api.archiveGoal(goal.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["goals"] });
      toast.success("Goal archived", goal.title);
      onClose();
    },
    onError: (err: unknown) => {
      toast.error("Archive failed", err instanceof Error ? err.message : String(err));
    },
  });

  const completeMut = useMutation({
    mutationFn: () => api.updateGoal(goal.id, { status: "done" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["goals"] });
      toast.success("Goal completed", goal.title);
      onClose();
    },
    onError: (err: unknown) => {
      toast.error("Could not complete goal", err instanceof Error ? err.message : String(err));
    },
  });

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveMut.mutate();
        }}
        className="space-y-5 p-4 md:p-6"
      >
        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent"
          />
        </Field>

        <Field label="Kind" hint={KIND_HINT[kind]}>
          <div className="flex flex-wrap gap-1.5">
            {(["outcome", "process", "identity"] as GoalKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  "rounded-md border px-3 py-1 text-xs transition-colors",
                  kind === k
                    ? "border-accent/60 bg-accent/15 text-fg"
                    : "border-border-subtle bg-surface text-fg-muted hover:border-accent/30",
                )}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </Field>

        {kind === "process" && (
          <Field label="Cadence" hint="How often this practice repeats.">
            <select
              value={cadence}
              onChange={(e) => setCadence(e.target.value as GoalCadence)}
              className="rounded-md border border-border-subtle bg-surface-elevated px-2 py-1 text-xs text-fg"
            >
              <option value="">— none —</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </Field>
        )}

        <Field
          label="Outcome"
          hint="What does success feel like? (WOOP: the felt picture of success.)"
        >
          <textarea
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent"
          />
        </Field>

        <Field
          label="Obstacle"
          hint="What's most likely to get in the way? Naming it makes it smaller."
        >
          <textarea
            value={obstacle}
            onChange={(e) => setObstacle(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent"
          />
        </Field>

        <Field
          label="If-then plan"
          hint="After [anchor], I will [behavior] in [context]. Pin the trigger."
        >
          <textarea
            value={implementationIntention}
            onChange={(e) => setImplementationIntention(e.target.value)}
            rows={2}
            placeholder="After I make my morning coffee, I will walk for 10 minutes in the neighborhood."
            className="w-full resize-none rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent"
          />
        </Field>

        {kind === "identity" && (
          <Field label="Identity statement" hint="I am someone who…">
            <input
              value={identityStatement}
              onChange={(e) => setIdentityStatement(e.target.value)}
              placeholder="I am someone who shows up for their own health."
              className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent"
            />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Horizon">
            <select
              value={horizon}
              onChange={(e) => setHorizon(e.target.value as GoalRow["horizon"])}
              className="w-full rounded-md border border-border-subtle bg-surface-elevated px-2 py-1.5 text-xs text-fg"
            >
              {(Object.keys(HORIZON_LABEL) as GoalRow["horizon"][]).map((h) => (
                <option key={h} value={h}>
                  {HORIZON_LABEL[h]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Review cadence">
            <select
              value={reviewCadence}
              onChange={(e) => setReviewCadence(e.target.value as GoalReviewCadence)}
              className="w-full rounded-md border border-border-subtle bg-surface-elevated px-2 py-1.5 text-xs text-fg"
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="as-needed">As needed</option>
            </select>
          </Field>
        </div>

        {kind !== "identity" && (
          <Field label="Due date" hint="Optional. Identity goals don't need one.">
            <input
              type="date"
              value={dueAtStr}
              onChange={(e) => setDueAtStr(e.target.value)}
              className="rounded-md border border-border-subtle bg-surface-elevated px-2 py-1.5 text-xs text-fg"
            />
          </Field>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-4">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={() => archiveMut.mutate()}
              disabled={archiveMut.isPending}
            >
              Archive
            </Button>
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={() => completeMut.mutate()}
              disabled={completeMut.isPending}
            >
              Mark done
            </Button>
          </div>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            loading={saveMut.isPending}
            disabled={saveMut.isPending}
          >
            Save
          </Button>
        </div>
      </form>
      {/* Signals live below the main form because they have their own create
          form — nesting forms is invalid HTML. */}
      <div className="px-4 pb-6 md:px-6">
        <SignalsSection goal={goal} />
      </div>
    </>
  );
}
