import { z } from "zod";

export const factCategory = z.enum([
  "health",
  "preference",
  "recipe",
  "task",
  "routine",
  "goal",
  "relationship",
  "other",
]);
export type FactCategory = z.infer<typeof factCategory>;

export const factSchema = z.object({
  id: z.string(),
  category: factCategory,
  subject: z.string().min(1),
  body: z.string().min(1),
  data: z.record(z.string(), z.unknown()).optional(),
  source: z.string().optional(),
  confidence: z.number().min(0).max(1).default(1),
  validFrom: z.number().int().nullable().optional(),
  validTo: z.number().int().nullable().optional(),
  createdAt: z.number().int(),
});
export type Fact = z.infer<typeof factSchema>;

export const newFactSchema = factSchema.omit({
  id: true,
  createdAt: true,
});
export type NewFact = z.infer<typeof newFactSchema>;

export const recallScope = z.enum([
  "facts",
  "documents",
  "messages",
  "reflections",
  "tasks",
  "all",
]);
export type RecallScope = z.infer<typeof recallScope>;

export const recallHitSchema = z.object({
  refType: z.enum(["fact", "document", "message", "reflection", "task"]),
  refId: z.string(),
  text: z.string(),
  score: z.number(),
  chunkIndex: z.number().int().optional(),
});
export type RecallHit = z.infer<typeof recallHitSchema>;
