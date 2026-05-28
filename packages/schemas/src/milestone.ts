import { z } from "zod";

/**
 * Milestones decompose abstract goals into concrete, ordered checkpoints.
 * Distinct from sub-goals (goals.parent_goal_id): milestones are
 * linearly ordered, lighter-weight, and don't carry kind/cadence/horizon.
 */

export const milestoneStatus = z.enum(["pending", "active", "done", "abandoned"]);
export type MilestoneStatus = z.infer<typeof milestoneStatus>;

/** Mirrors the artifact origin pattern so agent-proposed milestones can be
 *  distinguished from user-created ones. */
export const milestoneOrigin = z.enum(["manual", "conversation", "cron"]);
export type MilestoneOrigin = z.infer<typeof milestoneOrigin>;

export const milestoneSchema = z.object({
  id: z.string(),
  goalId: z.string(),
  title: z.string().min(1),
  body: z.string().nullable().optional(),
  status: milestoneStatus.default("pending"),
  orderIndex: z.number().int().default(0),
  dueAt: z.number().int().nullable().optional(),
  completedAt: z.number().int().nullable().optional(),
  origin: milestoneOrigin.default("manual"),
  confidence: z.number().min(0).max(1).nullable().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Milestone = z.infer<typeof milestoneSchema>;

export const newMilestoneSchema = milestoneSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
});
export type NewMilestone = z.infer<typeof newMilestoneSchema>;
