import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Target, Plus, CheckCircle2 } from "lucide-react";
import { ViewHeader } from "~/components/ui/ViewHeader";
import { Button } from "~/components/ui/Button";
import { IconButton } from "~/components/ui/IconButton";
import { api, type GoalRow, type ProjectRow } from "~/lib/api";
import { cn } from "~/lib/cn";

export const Route = createFileRoute("/goals")({
  component: GoalsRoute,
});

const HORIZON_LABEL: Record<GoalRow["horizon"], string> = {
  "this-week": "This week",
  "this-month": "This month",
  "this-quarter": "This quarter",
  "this-year": "This year",
  open: "Open",
};

const HORIZON_ORDER: GoalRow["horizon"][] = [
  "this-week",
  "this-month",
  "this-quarter",
  "this-year",
  "open",
];

function GoalsRoute(): JSX.Element {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);

  const { data: goalsData, isLoading } = useQuery({
    queryKey: ["goals", "active"],
    queryFn: () => api.goals("active"),
  });
  const { data: projectsData } = useQuery({
    queryKey: ["projects", "active"],
    queryFn: () => api.projects("active"),
  });

  const createMut = useMutation({
    mutationFn: api.createGoal,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["goals"] });
      setShowNew(false);
    },
  });

  const completeMut = useMutation({
    mutationFn: (id: string) => api.updateGoal(id, { status: "done" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["goals"] }),
  });

  // Group goals by horizon
  const grouped = new Map<GoalRow["horizon"], GoalRow[]>();
  for (const h of HORIZON_ORDER) grouped.set(h, []);
  for (const g of goalsData?.goals ?? []) {
    grouped.get(g.horizon)?.push(g);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewHeader
        title="Goals"
        subtitle="What you're working toward"
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowNew(true)}
          >
            <Plus className="size-3.5" strokeWidth={1.75} />
            New goal
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto mobile-safe-bottom">
        <div className="mx-auto max-w-2xl space-y-6 px-4 pb-4 pt-8 md:px-6">
          {projectsData && projectsData.projects.length > 0 && (
            <ProjectsSummary projects={projectsData.projects} />
          )}

          {showNew && (
            <NewGoalForm
              onSubmit={(input) => createMut.mutate(input)}
              onCancel={() => setShowNew(false)}
              pending={createMut.isPending}
              projects={projectsData?.projects ?? []}
            />
          )}

          {isLoading && (
            <ul className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <li
                  key={i}
                  className="h-16 animate-pulse rounded-md border border-border-subtle bg-surface/50"
                />
              ))}
            </ul>
          )}

          {!isLoading && (goalsData?.goals.length ?? 0) === 0 && !showNew && (
            <div className="mt-10 flex flex-col items-center gap-3 text-center">
              <Target className="size-8 text-fg-faint" strokeWidth={1.5} />
              <p className="text-sm text-fg-muted">No active goals.</p>
              <p className="max-w-sm text-xs text-fg-faint">
                Goals are durable intentions with a horizon. Add one to give the
                coach something to anchor recommendations against.
              </p>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowNew(true)}
                className="mt-2"
              >
                <Plus className="size-4" strokeWidth={1.75} />
                Add your first goal
              </Button>
            </div>
          )}

          {!isLoading &&
            HORIZON_ORDER.map((horizon) => {
              const goals = grouped.get(horizon) ?? [];
              if (goals.length === 0) return null;
              return (
                <section key={horizon}>
                  <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
                    {HORIZON_LABEL[horizon]}
                  </h2>
                  <ul className="space-y-2">
                    {goals.map((g) => (
                      <GoalCard
                        key={g.id}
                        goal={g}
                        onComplete={() => completeMut.mutate(g.id)}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
        </div>
      </div>
    </div>
  );
}

function ProjectsSummary({ projects }: { projects: ProjectRow[] }): JSX.Element {
  return (
    <section>
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
        Active projects
      </h2>
      <div className="flex flex-wrap gap-2">
        {projects.map((p) => (
          <span
            key={p.id}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-surface px-2.5 py-1 text-xs text-fg"
          >
            {p.title}
          </span>
        ))}
      </div>
    </section>
  );
}

function GoalCard({
  goal,
  onComplete,
}: {
  goal: GoalRow;
  onComplete: () => void;
}): JSX.Element {
  const hasTarget =
    goal.targetValue !== null && goal.targetValue !== undefined && goal.targetMetric;
  const progressPercent =
    hasTarget && goal.currentProgress !== null && goal.targetValue
      ? Math.min(100, Math.round((goal.currentProgress! / goal.targetValue) * 100))
      : null;

  return (
    <li className="rounded-md border border-border bg-surface px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-fg">{goal.title}</h3>
          {goal.body && (
            <p className="mt-1 text-xs text-fg-muted">{goal.body}</p>
          )}
          {goal.successCriteria && (
            <p className="mt-1 text-xs text-fg-faint">
              <span className="text-fg-muted">success:</span> {goal.successCriteria}
            </p>
          )}
          {hasTarget && (
            <div className="mt-2">
              <div className="flex justify-between text-[10px] font-mono text-fg-faint">
                <span>{goal.targetMetric}</span>
                <span>
                  {goal.currentProgress ?? 0} / {goal.targetValue}
                </span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-elevated">
                <div
                  className={cn(
                    "h-full rounded-full bg-accent transition-all",
                    progressPercent === 100 && "bg-success-500",
                  )}
                  style={{ width: `${progressPercent ?? 0}%` }}
                />
              </div>
            </div>
          )}
          {goal.dueAt && (
            <p className="mt-2 text-[10px] font-mono text-fg-faint">
              due {new Date(goal.dueAt).toISOString().slice(0, 10)}
            </p>
          )}
        </div>
        <IconButton
          variant="success"
          size="sm"
          onClick={onComplete}
          aria-label={`Complete ${goal.title}`}
        >
          <CheckCircle2 className="size-4" strokeWidth={1.75} />
        </IconButton>
      </div>
    </li>
  );
}

function NewGoalForm({
  onSubmit,
  onCancel,
  pending,
  projects,
}: {
  onSubmit: (input: Parameters<typeof api.createGoal>[0]) => void;
  onCancel: () => void;
  pending: boolean;
  projects: ProjectRow[];
}): JSX.Element {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [horizon, setHorizon] = useState<GoalRow["horizon"]>("this-week");
  const [successCriteria, setSuccessCriteria] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const canSubmit = title.trim().length > 0 && !pending;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        onSubmit({
          title: title.trim(),
          ...(body.trim() ? { body: body.trim() } : {}),
          horizon,
          ...(successCriteria.trim() ? { successCriteria: successCriteria.trim() } : {}),
          ...(projectId ? { projectId } : {}),
        });
      }}
      className="space-y-3 rounded-md border border-border bg-surface px-4 py-4"
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What do you want to achieve?"
        className="w-full bg-transparent text-sm text-fg placeholder:text-fg-faint focus:outline-none"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="Why does this matter? (optional)"
        className="w-full resize-none bg-transparent text-xs text-fg-muted placeholder:text-fg-faint focus:outline-none"
      />
      <textarea
        value={successCriteria}
        onChange={(e) => setSuccessCriteria(e.target.value)}
        rows={1}
        placeholder="How will you know it's done? (optional)"
        className="w-full resize-none bg-transparent text-xs text-fg-muted placeholder:text-fg-faint focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={horizon}
          onChange={(e) => setHorizon(e.target.value as GoalRow["horizon"])}
          className="rounded-md border border-border-subtle bg-surface-elevated px-2 py-1 text-xs text-fg"
        >
          {HORIZON_ORDER.map((h) => (
            <option key={h} value={h}>
              {HORIZON_LABEL[h]}
            </option>
          ))}
        </select>
        {projects.length > 0 && (
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="rounded-md border border-border-subtle bg-surface-elevated px-2 py-1 text-xs text-fg"
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            type="button"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            disabled={!canSubmit}
            loading={pending}
          >
            {pending ? "creating…" : "Add goal"}
          </Button>
        </div>
      </div>
    </form>
  );
}
