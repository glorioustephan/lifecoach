import { z } from "zod";

export const projectStatus = z.enum(["active", "paused", "done", "abandoned"]);
export type ProjectStatus = z.infer<typeof projectStatus>;

export const projectSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  body: z.string().nullable().optional(),
  status: projectStatus.default("active"),
  targetDate: z.number().int().nullable().optional(),
  startedAt: z.number().int(),
  endedAt: z.number().int().nullable().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Project = z.infer<typeof projectSchema>;

export const newProjectSchema = projectSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  startedAt: true,
  endedAt: true,
});
export type NewProject = z.infer<typeof newProjectSchema>;
