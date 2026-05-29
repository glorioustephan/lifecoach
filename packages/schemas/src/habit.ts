import { z } from "zod";

/**
 * Habits are first-class recurring actions — distinct from goals.
 * A habit may stand alone ("drink more water") or link up to a parent goal
 * and/or milestone via optional FKs.
 *
 * Cadence governs stall detection and the calendar-grid view:
 *  - daily:   expected at least once per ~2 days before stalled
 *  - weekly:  expected at least once per ~9 days before stalled
 *  - monthly: expected at least once per ~38 days before stalled
 *
 * Origin on completions distinguishes how the row was created:
 *  - manual:       user tapped the cell / pressed "Mark done" in the UI.
 *  - conversation: agent called record_habit_completion during a chat turn.
 *  - cron:         future: scheduled ingestion or device-based detection.
 */

export const habitCadence = z.enum(["daily", "weekly", "monthly"]);
export type HabitCadence = z.infer<typeof habitCadence>;

export const habitStatus = z.enum(["active", "paused", "archived"]);
export type HabitStatus = z.infer<typeof habitStatus>;

export const habitCompletionOrigin = z.enum(["manual", "conversation", "cron"]);
export type HabitCompletionOrigin = z.infer<typeof habitCompletionOrigin>;

export const habitSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  cadence: habitCadence,
  status: habitStatus,
  parentGoalId: z.string().nullable().optional(),
  parentMilestoneId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  lastCompletedAt: z.number().int().nullable().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Habit = z.infer<typeof habitSchema>;

export const newHabitSchema = habitSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  lastCompletedAt: true,
}).extend({
  status: habitStatus.optional(),
});
export type NewHabit = z.infer<typeof newHabitSchema>;

export const habitUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  cadence: habitCadence.optional(),
  status: habitStatus.optional(),
  parentGoalId: z.string().nullable().optional(),
  parentMilestoneId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type HabitUpdate = z.infer<typeof habitUpdateSchema>;

export const habitCompletionSchema = z.object({
  id: z.string(),
  habitId: z.string(),
  completedAt: z.number().int(),
  notes: z.string().nullable().optional(),
  origin: habitCompletionOrigin,
  createdAt: z.number().int(),
});
export type HabitCompletion = z.infer<typeof habitCompletionSchema>;

export const newHabitCompletionSchema = habitCompletionSchema.omit({
  id: true,
  createdAt: true,
});
export type NewHabitCompletion = z.infer<typeof newHabitCompletionSchema>;
