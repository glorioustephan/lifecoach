import { z } from "zod";

export const reflectionKind = z.enum(["daily", "weekly", "monthly"]);
export type ReflectionKind = z.infer<typeof reflectionKind>;

export const reflectionSchema = z.object({
  id: z.string(),
  periodStart: z.number().int(),
  periodEnd: z.number().int(),
  kind: reflectionKind,
  title: z.string().optional(),
  themes: z.array(z.string()).default([]),
  wins: z.array(z.string()).default([]),
  concerns: z.array(z.string()).default([]),
  openThreads: z.array(z.string()).default([]),
  body: z.string(),
  createdAt: z.number().int(),
});
export type Reflection = z.infer<typeof reflectionSchema>;

export const newReflectionSchema = reflectionSchema.omit({
  id: true,
  createdAt: true,
});
export type NewReflection = z.input<typeof newReflectionSchema>;
