import { z } from "zod";

/**
 * Time-horizon hint for a goal. Demoted in Phase 1 from primary grouping to a
 * soft chip — goals now group by `kind`. Kept on the row so existing data
 * (and the agent's mental model of "this is a this-week thing") survives.
 */
export const goalHorizon = z.enum([
  "this-week",
  "this-month",
  "this-quarter",
  "this-year",
  "open",
]);
export type GoalHorizon = z.infer<typeof goalHorizon>;

export const goalStatus = z.enum(["active", "paused", "done", "abandoned"]);
export type GoalStatus = z.infer<typeof goalStatus>;

/**
 * Outcome / Process / Identity kinds (Clear, Deci & Ryan). Identity goals are
 * exempt from due-date prompts; process goals carry a cadence; outcomes
 * behave most like the legacy "goal" concept (target + deadline).
 */
export const goalKind = z.enum(["outcome", "process", "identity"]);
export type GoalKind = z.infer<typeof goalKind>;

/** Only meaningful for kind='process'. */
export const goalCadence = z.enum(["daily", "weekly", "monthly"]);
export type GoalCadence = z.infer<typeof goalCadence>;

/** Surfacing rhythm — replaces hard dependence on horizon for identity goals. */
export const goalReviewCadence = z.enum(["weekly", "monthly", "quarterly", "as-needed"]);
export type GoalReviewCadence = z.infer<typeof goalReviewCadence>;

export const goalSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  /** Legacy "why it matters" / freeform body. Kept for back-compat; new copy
   *  goes into `outcome` / `obstacle` / `implementationIntention` / `identityStatement`. */
  body: z.string().nullable().optional(),
  horizon: goalHorizon.default("open"),
  status: goalStatus.default("active"),
  kind: goalKind.default("outcome"),
  cadence: goalCadence.nullable().optional(),
  /** WOOP "Outcome": the felt picture of success. */
  outcome: z.string().nullable().optional(),
  /** WOOP "Obstacle": the most-likely friction point. */
  obstacle: z.string().nullable().optional(),
  /** Single canonical if-then plan. "After <anchor>, I will <behavior> in <context>." */
  implementationIntention: z.string().nullable().optional(),
  /** "I am someone who…" — anchors identity-kind goals. */
  identityStatement: z.string().nullable().optional(),
  /** @deprecated Prefer `outcome` (qualitative felt-success) and the upcoming
   *  goal-signals table (multiple measurable signals). Kept for back-compat. */
  successCriteria: z.string().nullable().optional(),
  parentGoalId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  targetMetric: z.string().nullable().optional(),
  targetValue: z.number().nullable().optional(),
  currentProgress: z.number().nullable().optional(),
  reviewCadence: goalReviewCadence.default("weekly"),
  lastReviewedAt: z.number().int().nullable().optional(),
  archivedAt: z.number().int().nullable().optional(),
  dueAt: z.number().int().nullable().optional(),
  completedAt: z.number().int().nullable().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Goal = z.infer<typeof goalSchema>;

export const newGoalSchema = goalSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
  lastReviewedAt: true,
  archivedAt: true,
});
export type NewGoal = z.infer<typeof newGoalSchema>;
