import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Target, Plus } from "lucide-react";
import { ViewHeader } from "~/components/ui/ViewHeader";
import { Button } from "~/components/ui/Button";
import {
  api,
  type GoalKind,
  type GoalRow,
  type MilestoneRow,
  type ProjectRow,
} from "~/lib/api";
import { cn } from "~/lib/cn";
import { GoalCard } from "~/components/goals/GoalCard";
import { GoalEditSheet } from "~/components/goals/GoalEditSheet";

export const Route = createFileRoute("/goals")({
  component: GoalsRoute,
});

const KIND_ORDER: GoalKind[] = ["outcome", "process", "identity"];
const KIND_LABEL: Record<GoalKind, string> = {
  outcome: "Outcomes",
  process: "Processes",
  identity: "Identity",
};
const KIND_BLURB: Record<GoalKind, string> = {
  outcome: "Finite achievements with a definable end.",
  process: "Recurring practices on a cadence.",
  identity: "Who you are becoming.",
};

const HORIZON_LABEL: Record<GoalRow["horizon"], string> = {
  "this-week": "this week",
  "this-month": "this month",
  "this-quarter": "this quarter",
  "this-year": "this year",
  open: "open",
};

function GoalsRoute(): JSX.Element {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<GoalRow | null>(null);

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

  // Group goals by kind. Within a group, list order matches what the server
  // returned (last_reviewed_at ASC then horizon priority).
  const grouped = new Map<GoalKind, GoalRow[]>();
  for (const k of KIND_ORDER) grouped.set(k, []);
  for (const g of goalsData?.goals ?? []) {
    grouped.get(g.kind)?.push(g);
  }

  // Fetch milestones for every visible goal in parallel. React Query dedupes
  // and caches, so opening/closing the edit sheet doesn't re-fetch.
  const milestoneQueries = useQueries({
    queries: (goalsData?.goals ?? []).map((g) => ({
      queryKey: ["goals", g.id, "milestones"] as const,
      queryFn: () => api.goalMilestones(g.id),
      staleTime: 30_000,
    })),
  });
  const milestonesById = new Map<string, MilestoneRow[]>();
  (goalsData?.goals ?? []).forEach((g, idx) => {
    const data = milestoneQueries[idx]?.data;
    if (data) milestonesById.set(g.id, data.milestones);
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewHeader
        title="Goals"
        subtitle="What you're working toward"
        actions={
          <Button variant="secondary" size="sm" onClick={() => setShowNew(true)}>
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
            />
          )}

          {isLoading && (
            <ul className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <li
                  key={i}
                  className="h-20 animate-pulse rounded-md border border-border-subtle bg-surface/50"
                />
              ))}
            </ul>
          )}

          {!isLoading && (goalsData?.goals.length ?? 0) === 0 && !showNew && (
            <div className="mt-10 flex flex-col items-center gap-3 text-center">
              <Target className="size-8 text-fg-faint" strokeWidth={1.5} />
              <p className="text-sm text-fg-muted">No active goals.</p>
              <p className="max-w-sm text-xs text-fg-faint">
                Pick one thing you're moving toward this season. We'll help you
                turn it into milestones and a first action.
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
            KIND_ORDER.map((kind) => {
              const goals = grouped.get(kind) ?? [];
              if (goals.length === 0) return null;
              return (
                <section key={kind}>
                  <header className="mb-2 flex items-baseline justify-between gap-3">
                    <h2 className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
                      {KIND_LABEL[kind]}
                    </h2>
                    <span className="text-[11px] text-fg-faint">{KIND_BLURB[kind]}</span>
                  </header>
                  <ul className="space-y-2">
                    {goals.map((g) => (
                      <GoalCard
                        key={g.id}
                        goal={g}
                        milestones={milestonesById.get(g.id) ?? []}
                        onOpen={() => setEditing(g)}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
        </div>
      </div>
      <GoalEditSheet goal={editing} onClose={() => setEditing(null)} />
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

function NewGoalForm({
  onSubmit,
  onCancel,
  pending,
}: {
  onSubmit: (input: Parameters<typeof api.createGoal>[0]) => void;
  onCancel: () => void;
  pending: boolean;
}): JSX.Element {
  const [title, setTitle] = useState("");
  const [outcome, setOutcome] = useState("");
  const [kind, setKind] = useState<GoalKind>("outcome");
  const canSubmit = title.trim().length > 0 && !pending;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        onSubmit({
          title: title.trim(),
          kind,
          ...(outcome.trim() ? { outcome: outcome.trim() } : {}),
        });
      }}
      className="space-y-3 rounded-md border border-border bg-surface px-4 py-4"
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What do you want to do, become, or build?"
        className="w-full bg-transparent text-sm text-fg placeholder:text-fg-faint focus:outline-none"
      />
      <textarea
        value={outcome}
        onChange={(e) => setOutcome(e.target.value)}
        rows={2}
        placeholder="What does success feel like? (optional, you can fill this in later)"
        className="w-full resize-none bg-transparent text-xs text-fg-muted placeholder:text-fg-faint focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          {KIND_ORDER.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-[11px] transition-colors",
                kind === k
                  ? "border-accent/60 bg-accent/15 text-fg"
                  : "border-border-subtle bg-surface text-fg-muted hover:border-accent/30",
              )}
            >
              {KIND_LABEL[k].replace(/s$/, "")}
            </button>
          ))}
        </div>
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
      <p className="text-[11px] text-fg-faint">
        Tip: this is the bare minimum. Add the obstacle, if-then plan, and
        milestones once you've created it — click the goal card to open the
        full editor.
      </p>
    </form>
  );
}
