import { z } from "zod";

/**
 * OKR-lite "signals of progress" for a goal. Multiple per goal, each
 * quantitative (tied to a measurements metric + target value) or qualitative
 * (a sentence the user reads as success — e.g. "I sleep before midnight most
 * weeknights"). Replaces the legacy single `success_criteria` string.
 */

export const goalSignalKind = z.enum(["quantitative", "qualitative"]);
export type GoalSignalKind = z.infer<typeof goalSignalKind>;

export const goalSignalSchema = z.object({
  id: z.string(),
  goalId: z.string(),
  label: z.string().min(1),
  kind: goalSignalKind.default("qualitative"),
  /** Snake-case metric name from `measurements.metric`. Null for qualitative. */
  metric: z.string().nullable().optional(),
  targetValue: z.number().nullable().optional(),
  currentValue: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type GoalSignal = z.infer<typeof goalSignalSchema>;

export const newGoalSignalSchema = goalSignalSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type NewGoalSignal = z.infer<typeof newGoalSignalSchema>;
