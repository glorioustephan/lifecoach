import { z } from "zod";

// Todoist uses 1 (normal) → 4 (urgent). We mirror that scale.
export const taskPriority = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);
export type TaskPriority = z.infer<typeof taskPriority>;

export const taskSchema = z.object({
  id: z.string(),
  /** ID assigned by the upstream system (e.g. Todoist task id). Null for local tasks. */
  externalId: z.string().nullable().optional(),
  /** Upstream system identifier, e.g. 'todoist'. Null for local-only tasks. */
  externalSource: z.string().nullable().optional(),
  content: z.string().min(1),
  description: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  projectName: z.string().nullable().optional(),
  labels: z.array(z.string()).default([]),
  priority: taskPriority.nullable().optional(),
  /** Due timestamp in ms. Null if undated. */
  dueAt: z.number().int().nullable().optional(),
  /** Human-readable due string from the upstream (e.g. 'tomorrow at 10am'). */
  dueString: z.string().nullable().optional(),
  /** Completion timestamp in ms. Null if still active. */
  completedAt: z.number().int().nullable().optional(),
  url: z.string().url().nullable().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  /** Last time we synced this row from the upstream. */
  syncedAt: z.number().int(),
});
export type Task = z.infer<typeof taskSchema>;

export const newTaskSchema = taskSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  syncedAt: true,
});
export type NewTask = z.infer<typeof newTaskSchema>;
