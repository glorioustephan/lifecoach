import type { GoalRow, MilestoneRow } from "~/lib/api";
import { cn } from "~/lib/cn";

const HORIZON_LABEL: Record<GoalRow["horizon"], string> = {
  "this-week": "this week",
  "this-month": "this month",
  "this-quarter": "this quarter",
  "this-year": "this year",
  open: "open",
};

// Mirrors packages/core/src/util/goal-cadence.ts. Duplicated rather than
// imported to keep the web bundle free of core deps; the values here must stay
// in lockstep with that file.
const DAY = 24 * 60 * 60 * 1000;
const STALLED_WINDOW_MS: Record<GoalRow["reviewCadence"], number | null> = {
  weekly: 9 * DAY,
  monthly: 38 * DAY,
  quarterly: 110 * DAY,
  "as-needed": null,
};

const computeStaleAgeDays = (goal: GoalRow): number | null => {
  if (goal.status !== "active" || goal.archivedAt !== null) return null;
  const window = STALLED_WINDOW_MS[goal.reviewCadence];
  if (window === null) return null;
  const lastTouch = Math.max(goal.lastReviewedAt ?? 0, goal.createdAt);
  const age = Date.now() - lastTouch;
  return age > window ? Math.floor(age / DAY) : null;
};

interface GoalCardProps {
  goal: GoalRow;
  /** Pass an empty array when milestones haven't loaded yet — the progress
   *  bar simply doesn't render. */
  milestones: MilestoneRow[];
  /** Click handler — typically opens the edit Sheet. */
  onOpen: () => void;
}

/**
 * One row in the goals list. Designed to surface the most relevant facet of a
 * goal at a glance:
 *  - title + kind/cadence/horizon chips
 *  - the best available description (outcome > body > identity > legacy)
 *  - implementation intention if present (because if-then plans are the
 *    research-backed lever for behaviour change)
 *  - milestone progress bar (the real "are we doing it?" signal)
 *  - due date for finite-kind goals only (identity goals don't get one)
 */
export function GoalCard({ goal, milestones, onOpen }: GoalCardProps): JSX.Element {
  const totalMilestones = milestones.length;
  const doneMilestones = milestones.filter((m) => m.status === "done").length;
  const milestonePercent =
    totalMilestones > 0 ? Math.round((doneMilestones / totalMilestones) * 100) : null;

  const detail =
    goal.outcome ??
    goal.body ??
    goal.identityStatement ??
    goal.successCriteria ??
    null;

  const staleAgeDays = computeStaleAgeDays(goal);

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="block w-full rounded-md border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-accent/40 hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 flex-1 text-sm font-medium text-fg">{goal.title}</h3>
          <div className="flex shrink-0 flex-wrap items-center gap-1">
            {staleAgeDays !== null && (
              <span
                className="rounded-sm bg-warning-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning-500"
                title="No touch within this goal's review cadence"
              >
                stalled · {staleAgeDays}d
              </span>
            )}
            <GoalChips goal={goal} />
          </div>
        </div>

        {detail && <p className="mt-1 line-clamp-2 text-xs text-fg-muted">{detail}</p>}

        {goal.implementationIntention && (
          <p className="mt-1 line-clamp-1 text-[11px] text-fg-faint">
            <span className="text-fg-muted">plan:</span> {goal.implementationIntention}
          </p>
        )}

        {milestonePercent !== null && (
          <div className="mt-3">
            <div className="flex justify-between text-[10px] font-mono text-fg-faint">
              <span>milestones</span>
              <span>
                {doneMilestones} / {totalMilestones}
              </span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-elevated">
              <div
                className={cn(
                  "h-full rounded-full bg-accent transition-all",
                  milestonePercent === 100 && "bg-success-500",
                )}
                style={{ width: `${milestonePercent}%` }}
              />
            </div>
          </div>
        )}

        {goal.dueAt && goal.kind !== "identity" && (
          <p className="mt-2 text-[10px] font-mono text-fg-faint">
            due {new Date(goal.dueAt).toISOString().slice(0, 10)}
          </p>
        )}
      </button>
    </li>
  );
}

function GoalChips({ goal }: { goal: GoalRow }): JSX.Element {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1">
      {goal.kind === "process" && goal.cadence && (
        <span className="rounded-sm bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
          {goal.cadence}
        </span>
      )}
      {goal.horizon !== "open" && (
        <span className="rounded-sm border border-border-subtle px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-fg-faint">
          {HORIZON_LABEL[goal.horizon]}
        </span>
      )}
    </div>
  );
}
