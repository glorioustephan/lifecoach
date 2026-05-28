import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, Plus, Trash2 } from "lucide-react";
import { Sheet, SheetBody, SheetHeader } from "~/components/ui/Sheet";
import { Button } from "~/components/ui/Button";
import { TabNav } from "~/components/ui/TabNav";
import {
  api,
  type GoalCadence,
  type GoalKind,
  type GoalReviewCadence,
  type GoalRow,
  type MilestoneRow,
} from "~/lib/api";
import { cn } from "~/lib/cn";

interface GoalEditSheetProps {
  goal: GoalRow | null;
  onClose: () => void;
}

type Tab = "overview" | "milestones" | "tasks" | "evidence";

const KIND_LABEL: Record<GoalKind, string> = {
  outcome: "Outcome",
  process: "Process",
  identity: "Identity",
};

const KIND_HINT: Record<GoalKind, string> = {
  outcome: "A finite achievement with a definable end.",
  process: "A recurring practice with a cadence (daily / weekly / monthly).",
  identity: "Who you are becoming. No end date required.",
};

const HORIZON_LABEL: Record<GoalRow["horizon"], string> = {
  "this-week": "This week",
  "this-month": "This month",
  "this-quarter": "This quarter",
  "this-year": "This year",
  open: "Open",
};

/**
 * Sheet-based goal editor. Three tabs:
 *  - Overview: every WOOP / kind / cadence field, plus archive / status controls.
 *  - Milestones: linear-ordered list with add / complete / delete.
 *  - Tasks: tasks already linked to this goal (read-only in Phase 1 — linking
 *    happens from the chat agent for now).
 *
 * Evidence tab is a Phase 2 placeholder. Wired now so the tab nav doesn't move
 * when it lands.
 *
 * Mirrors the EditArtifactSheet pattern in routes/artifacts.tsx: controlled
 * inputs seeded from the row on open, dirty-guard before close, debounced
 * mutate-on-save.
 */
export function GoalEditSheet({ goal, onClose }: GoalEditSheetProps): JSX.Element | null {
  const [tab, setTab] = useState<Tab>("overview");

  // Reset to overview every time the sheet opens on a different goal so the
  // user lands somewhere predictable.
  useEffect(() => {
    if (goal) setTab("overview");
  }, [goal?.id]);

  if (!goal) return null;

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      side="right"
      width="w-full md:w-[560px]"
    >
      <SheetHeader title={goal.title} onClose={onClose} />
      <TabNav<Tab>
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "milestones", label: "Milestones" },
          { id: "tasks", label: "Tasks" },
          { id: "evidence", label: "Evidence" },
        ]}
        active={tab}
        onChange={setTab}
        variant="underline"
        width="none"
      />
      <SheetBody>
        {tab === "overview" && <OverviewTab goal={goal} onClose={onClose} />}
        {tab === "milestones" && <MilestonesTab goal={goal} />}
        {tab === "tasks" && <TasksTab goal={goal} />}
        {tab === "evidence" && <EvidenceTab goal={goal} />}
      </SheetBody>
    </Sheet>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({
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
    },
  });

  const archiveMut = useMutation({
    mutationFn: () => api.archiveGoal(goal.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["goals"] });
      onClose();
    },
  });

  const completeMut = useMutation({
    mutationFn: () => api.updateGoal(goal.id, { status: "done" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["goals"] });
      onClose();
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

// ── Milestones tab ────────────────────────────────────────────────────────────

function MilestonesTab({ goal }: { goal: GoalRow }): JSX.Element {
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

// ── Tasks tab ─────────────────────────────────────────────────────────────────

function TasksTab({ goal }: { goal: GoalRow }): JSX.Element {
  // Phase 1 reads tasks via the existing /api/tasks endpoint and filters
  // client-side by goalId. Linking happens from the chat agent.
  const { data } = useQuery({ queryKey: ["tasks", "all"], queryFn: () => api.tasks() });
  const linked = useMemo(
    () => (data?.tasks ?? []).filter((t) => t.goalId === goal.id),
    [data, goal.id],
  );

  return (
    <div className="space-y-4 p-4 md:p-6">
      <p className="text-xs text-fg-faint">
        Tasks linked to this goal. To link a Todoist task, ask the coach in chat
        to "link &lt;task&gt; to &lt;this goal&gt;".
      </p>
      {linked.length === 0 ? (
        <p className="text-xs text-fg-faint">No linked tasks yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {linked.map((t) => (
            <li
              key={t.id}
              className="rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm text-fg"
            >
              <div className="flex items-center justify-between gap-2">
                <span className={t.completedAt ? "text-fg-faint line-through" : ""}>
                  {t.content}
                </span>
                {t.dueString && (
                  <span className="text-[10px] font-mono text-fg-faint">{t.dueString}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Signals section (rendered under Overview) ────────────────────────────────

function SignalsSection({ goal }: { goal: GoalRow }): JSX.Element {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["goals", goal.id, "signals"],
    queryFn: () => api.goalSignals(goal.id),
  });

  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<"qualitative" | "quantitative">("qualitative");
  const [metric, setMetric] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [unit, setUnit] = useState("");

  const createMut = useMutation({
    mutationFn: () =>
      api.createGoalSignal(goal.id, {
        label: label.trim(),
        kind,
        ...(kind === "quantitative" && metric.trim() ? { metric: metric.trim() } : {}),
        ...(kind === "quantitative" && targetValue.trim()
          ? { targetValue: Number(targetValue) }
          : {}),
        ...(kind === "quantitative" && unit.trim() ? { unit: unit.trim() } : {}),
      }),
    onSuccess: () => {
      setLabel("");
      setMetric("");
      setTargetValue("");
      setUnit("");
      void qc.invalidateQueries({ queryKey: ["goals", goal.id, "signals"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteGoalSignal(goal.id, id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["goals", goal.id, "signals"] }),
  });

  const signals = data?.signals ?? [];

  return (
    <section className="space-y-3 border-t border-border-subtle pt-4">
      <header className="space-y-0.5">
        <h3 className="text-xs font-medium uppercase tracking-wide text-fg-muted">
          Signals of progress
        </h3>
        <p className="text-[11px] text-fg-faint">
          Several per goal. Quantitative signals tie to a measurement metric;
          qualitative signals are sentence-shaped.
        </p>
      </header>

      {isLoading ? (
        <ul className="space-y-1.5">
          {Array.from({ length: 1 }).map((_, i) => (
            <li
              key={i}
              className="h-10 animate-pulse rounded-md border border-border-subtle bg-surface/50"
            />
          ))}
        </ul>
      ) : signals.length === 0 ? (
        <p className="text-[11px] text-fg-faint">No signals yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {signals.map((s) => {
            const hasTarget = s.targetValue !== null && s.targetValue !== undefined;
            const pct =
              hasTarget && s.targetValue
                ? Math.min(
                    100,
                    Math.round(((s.currentValue ?? 0) / s.targetValue) * 100),
                  )
                : null;
            return (
              <li
                key={s.id}
                className="group flex items-start gap-2 rounded-md border border-border-subtle bg-surface px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-fg">{s.label}</p>
                  {s.kind === "quantitative" && s.metric && (
                    <div className="mt-1">
                      <div className="flex justify-between text-[10px] font-mono text-fg-faint">
                        <span>{s.metric}</span>
                        <span>
                          {s.currentValue ?? 0} / {s.targetValue ?? "—"}
                          {s.unit ? ` ${s.unit}` : ""}
                        </span>
                      </div>
                      {pct !== null && (
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-elevated">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              pct === 100 ? "bg-success-500" : "bg-accent",
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => deleteMut.mutate(s.id)}
                  aria-label={`Delete signal ${s.label}`}
                  className="text-fg-faint opacity-0 transition-opacity hover:text-destructive-300 group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" strokeWidth={1.75} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (label.trim().length === 0) return;
          createMut.mutate();
        }}
        className="space-y-2 rounded-md border border-border-subtle bg-surface px-3 py-3"
      >
        <div className="flex items-center gap-1">
          {(["qualitative", "quantitative"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                "rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-wide transition-colors",
                kind === k
                  ? "border-accent/60 bg-accent/15 text-fg"
                  : "border-border-subtle bg-surface text-fg-muted hover:border-accent/30",
              )}
            >
              {k}
            </button>
          ))}
        </div>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={
            kind === "qualitative"
              ? "Sentence — what does success read like?"
              : "Short label, e.g. 'Pace under 5:30/km'"
          }
          className="w-full rounded-md border border-border bg-surface-elevated px-2 py-1.5 text-sm text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent"
        />
        {kind === "quantitative" && (
          <div className="grid grid-cols-3 gap-2">
            <input
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              placeholder="metric"
              className="rounded-md border border-border-subtle bg-surface-elevated px-2 py-1 text-xs text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent"
            />
            <input
              type="number"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              placeholder="target"
              className="rounded-md border border-border-subtle bg-surface-elevated px-2 py-1 text-xs text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent"
            />
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="unit"
              className="rounded-md border border-border-subtle bg-surface-elevated px-2 py-1 text-xs text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent"
            />
          </div>
        )}
        <div className="flex justify-end">
          <Button
            variant="secondary"
            size="sm"
            type="submit"
            disabled={label.trim().length === 0 || createMut.isPending}
            loading={createMut.isPending}
          >
            <Plus className="size-3.5" strokeWidth={1.75} />
            Add signal
          </Button>
        </div>
      </form>
    </section>
  );
}

// ── Evidence tab ──────────────────────────────────────────────────────────────

const ORIGIN_LABEL: Record<"manual" | "conversation" | "cron", string> = {
  manual: "you",
  conversation: "chat",
  cron: "system",
};

const formatRelativeTime = (ms: number): string => {
  const diff = Date.now() - ms;
  const day = 24 * 60 * 60 * 1000;
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < day) return `${Math.floor(diff / 3600_000)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(ms).toISOString().slice(0, 10);
};

function EvidenceTab({ goal }: { goal: GoalRow }): JSX.Element {
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
          className="w-full resize-none rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent"
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
                <span>{formatRelativeTime(e.recordedAt)}</span>
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

// ── Field wrapper ─────────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <label className="block space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">
          {label}
        </span>
      </div>
      {hint && <p className="text-[11px] text-fg-faint">{hint}</p>}
      {children}
    </label>
  );
}
