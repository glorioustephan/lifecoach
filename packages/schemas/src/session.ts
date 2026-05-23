import { z } from "zod";

export const sessionSchema = z.object({
  id: z.string(),
  startedAt: z.number().int(),
  endedAt: z.number().int().nullable().optional(),
  summary: z.string().nullable().optional(),
  archivedAt: z.number().int().nullable().optional(),
});
export type Session = z.infer<typeof sessionSchema>;

export const newSessionSchema = sessionSchema.omit({ id: true });
export type NewSession = z.infer<typeof newSessionSchema>;
