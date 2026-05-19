import { z } from "zod";

export const insightSchema = z.object({
  id: z.string(),
  topic: z.string(),
  body: z.string(),
  rationale: z.string().optional(),
  sourceFactIds: z.array(z.string()).default([]),
  createdAt: z.number().int(),
  actedOnAt: z.number().int().nullable().optional(),
  dismissedAt: z.number().int().nullable().optional(),
});
export type Insight = z.infer<typeof insightSchema>;

export const newInsightSchema = insightSchema.omit({
  id: true,
  createdAt: true,
  actedOnAt: true,
  dismissedAt: true,
});
export type NewInsight = z.infer<typeof newInsightSchema>;
