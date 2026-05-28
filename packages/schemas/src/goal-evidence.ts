import { z } from "zod";

/**
 * Append-only progress feed for a goal. Every nudge, log, or detected
 * mention writes here, and the Reflector / Insighter / Briefing read it to
 * notice progress, stalls, and obstacle handling.
 *
 * Origin distinguishes who created the row:
 *  - manual:       user pressed "Log evidence" in the UI.
 *  - conversation: the agent called record_goal_evidence during a chat turn
 *                  (only when the user explicitly mentioned a goal — not a
 *                  real-time classifier).
 *  - cron:         the goal-review pass or the weekly reflector inferred it
 *                  from linked task completions / milestones / measurements.
 */

export const goalEvidenceOrigin = z.enum(["manual", "conversation", "cron"]);
export type GoalEvidenceOrigin = z.infer<typeof goalEvidenceOrigin>;

/** Mirrors the broader evidenceRef pattern in `insight.ts` but narrowed to
 *  the rows we'd realistically link from a goal-evidence entry. */
export const goalEvidenceSourceRefType = z.enum([
  "message",
  "task",
  "milestone",
  "measurement",
  "reflection",
  "manual",
]);
export type GoalEvidenceSourceRefType = z.infer<typeof goalEvidenceSourceRefType>;

export const goalEvidenceSchema = z.object({
  id: z.string(),
  goalId: z.string(),
  milestoneId: z.string().nullable().optional(),
  signalId: z.string().nullable().optional(),
  body: z.string().min(1),
  sourceRefType: goalEvidenceSourceRefType.nullable().optional(),
  sourceRefId: z.string().nullable().optional(),
  /** Optional numeric delta toward a signal's target. */
  delta: z.number().nullable().optional(),
  recordedAt: z.number().int(),
  origin: goalEvidenceOrigin.default("manual"),
  confidence: z.number().min(0).max(1).nullable().optional(),
  createdAt: z.number().int(),
});
export type GoalEvidence = z.infer<typeof goalEvidenceSchema>;

export const newGoalEvidenceSchema = goalEvidenceSchema.omit({
  id: true,
  createdAt: true,
});
export type NewGoalEvidence = z.infer<typeof newGoalEvidenceSchema>;
