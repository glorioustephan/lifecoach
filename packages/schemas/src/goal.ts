import { z } from "zod";

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

export const goalSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  body: z.string().nullable().optional(),
  horizon: goalHorizon.default("open"),
  status: goalStatus.default("active"),
  successCriteria: z.string().nullable().optional(),
  parentGoalId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  targetMetric: z.string().nullable().optional(),
  targetValue: z.number().nullable().optional(),
  currentProgress: z.number().nullable().optional(),
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
});
export type NewGoal = z.infer<typeof newGoalSchema>;
