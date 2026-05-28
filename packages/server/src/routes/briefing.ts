import { Hono } from "hono";
import type { Lifecoach } from "@lifecoach/core";
import { isGoalStalled } from "@lifecoach/core";
import { FINANCE_EVIDENCE_REF_TYPES, type Goal, type Milestone, type Task } from "@lifecoach/schemas";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

/**
 * Conditional finance tile for the morning briefing. Silence is the default —
 * we only return a tile when there's something worth a glance:
 *   - a meaningful net-worth movement over the last week, OR
 *   - a high-priority (p≥2) finance insight created in the last 24h.
 */
type FinanceTile =
  | {
      kind: "net_worth_delta";
      currentValue: number;
      deltaAmount: number;
      deltaPercent: number;
      windowDays: number;
    }
  | {
      kind: "insight";
      insightId: string;
      topic: string;
      priority: 1 | 2 | 3;
    };

const computeFinanceTile = (lc: Lifecoach, nowMs: number): FinanceTile | null => {
  const nwSeries = lc.storage.measurements.query("net_worth", {
    from: nowMs - SEVEN_DAYS_MS - ONE_DAY_MS,
    to: nowMs,
  });
  if (nwSeries.length >= 2) {
    const oldest = nwSeries[0]!;
    const latest = nwSeries[nwSeries.length - 1]!;
    const deltaAmount = latest.value - oldest.value;
    const deltaPercent = oldest.value !== 0 ? (deltaAmount / Math.abs(oldest.value)) * 100 : 0;
    // Meaningful = at least $500 OR 1% movement — avoids tiny daily noise.
    if (Math.abs(deltaAmount) >= 500 || Math.abs(deltaPercent) >= 1) {
      return {
        kind: "net_worth_delta",
        currentValue: latest.value,
        deltaAmount,
        deltaPercent,
        windowDays: Math.max(
          1,
          Math.round((latest.recordedAt - oldest.recordedAt) / ONE_DAY_MS),
        ),
      };
    }
  }
  // Fallback to a fresh, high-priority finance insight.
  const recent = lc.storage.insights
    .list({ state: "active", limit: 50 })
    .filter(
      (i) =>
        i.createdAt > nowMs - ONE_DAY_MS &&
        i.priority >= 2 &&
        i.evidenceRefs.some((r) => FINANCE_EVIDENCE_REF_TYPES.has(r.refType)),
    )
    .sort((a, b) => b.priority - a.priority || b.createdAt - a.createdAt)[0];
  if (recent) {
    return {
      kind: "insight",
      insightId: recent.id,
      topic: recent.topic,
      priority: recent.priority,
    };
  }
  return null;
};

/**
 * The morning briefing endpoint composes a single response from every system
 * that matters for "what to know about today":
 *   - overdue + due-today tasks
 *   - active goals with their progress
 *   - top fresh insights (priority desc, last 7d)
 *   - latest weekly reflection (title + 1-line opener)
 *   - quick stats so the UI can render a status strip
 */
export const briefingRoutes = (lc: Lifecoach) => {
  const app = new Hono();

  app.get("/", (c) => {
    const nowMs = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = todayStart.getTime() + ONE_DAY_MS;

    // Tasks — overdue + due today
    const allActive = lc.storage.tasks.list({ status: "active", limit: 1_000_000 });
    const overdue = allActive.filter(
      (t) => t.dueAt !== null && t.dueAt !== undefined && t.dueAt < todayStart.getTime(),
    );
    const dueToday = allActive.filter(
      (t) =>
        t.dueAt !== null &&
        t.dueAt !== undefined &&
        t.dueAt >= todayStart.getTime() &&
        t.dueAt < tomorrowStart,
    );

    // Goals — active, sorted by horizon priority + due_at. For each goal we
    // also surface the next action (next active linked task) and a stalled
    // signal so the briefing reads as "here's what to do" rather than "here's
    // a list of names."
    const activeGoals = lc.storage.goals.list({ status: "active", limit: 50 });
    const goalsAugmented = augmentGoalsForBriefing(lc, activeGoals.slice(0, 8), nowMs);

    // Insights — fresh top-priority active ones (last 7d)
    const insights = lc.storage.insights
      .list({ state: "active", limit: 20 })
      .filter((i) => i.createdAt > nowMs - 7 * ONE_DAY_MS)
      .slice(0, 3);

    // Latest reflection (any kind)
    const reflectionRow = lc.storage.handle.db
      .prepare(
        `SELECT id, kind, period_start, period_end, body, created_at
         FROM reflections ORDER BY period_end DESC LIMIT 1`,
      )
      .get() as
      | {
          id: string;
          kind: string;
          period_start: number;
          period_end: number;
          body: string;
          created_at: number;
        }
      | undefined;

    const finance = computeFinanceTile(lc, nowMs);

    return c.json({
      generatedAt: nowMs,
      tasks: {
        overdue: overdue.slice(0, 10),
        dueToday: dueToday.slice(0, 10),
        totalActive: allActive.length,
      },
      goals: {
        active: goalsAugmented,
        totalActive: activeGoals.length,
      },
      insights,
      reflection: reflectionRow ?? null,
      finance, // null when nothing worth a glance — silence by default.
    });
  });

  return app;
};

/**
 * Payload shape returned for each goal in the briefing — the goal itself plus
 * the derived fields the panel renders next to it: next linked task, next
 * pending milestone, last evidence timestamp, and a stalled flag.
 */
export interface BriefingGoal {
  goal: Goal;
  nextTask: Task | null;
  nextMilestone: Milestone | null;
  lastEvidenceAt: number | null;
  stalled: boolean;
}

const augmentGoalsForBriefing = (
  lc: Lifecoach,
  goals: Goal[],
  nowMs: number,
): BriefingGoal[] => {
  if (goals.length === 0) return [];
  // Bulk-fetch the last evidence per goal so we only query once.
  const lastEvidence = lc.storage.goalEvidence.latestByGoals(goals.map((g) => g.id));
  // Linked active tasks — gather once, group by goal.
  const linkedTasks = new Map<string, Task[]>();
  for (const t of lc.storage.tasks.list({ status: "active", limit: 1_000_000 })) {
    if (!t.goalId) continue;
    const bucket = linkedTasks.get(t.goalId) ?? [];
    bucket.push(t);
    linkedTasks.set(t.goalId, bucket);
  }

  return goals.map((goal) => {
    // Next action = soonest-due linked active task, falling back to newest.
    const linked = linkedTasks.get(goal.id) ?? [];
    const nextTask =
      linked
        .slice()
        .sort((a, b) => {
          const aDue = a.dueAt ?? Number.POSITIVE_INFINITY;
          const bDue = b.dueAt ?? Number.POSITIVE_INFINITY;
          if (aDue !== bDue) return aDue - bDue;
          return b.createdAt - a.createdAt;
        })[0] ?? null;

    // Next milestone = lowest order_index that's still pending or active.
    const nextMilestone =
      lc.storage.milestones
        .list({ goalId: goal.id, status: "all", limit: 50 })
        .find((m) => m.status === "pending" || m.status === "active") ?? null;

    const lastEv = lastEvidence.get(goal.id);
    const lastEvidenceAt = lastEv?.recordedAt ?? null;

    return {
      goal,
      nextTask,
      nextMilestone,
      lastEvidenceAt,
      stalled: isGoalStalled(goal, lastEvidenceAt, nowMs),
    };
  });
};
