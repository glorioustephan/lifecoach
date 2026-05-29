import { z } from "zod";
import { goalKind } from "./goal.js";
import { habitCadence } from "./habit.js";

export const insightPriority = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);
export type InsightPriority = z.infer<typeof insightPriority>;

export const evidenceRefType = z.enum([
  "fact",
  "goal",
  "task",
  "measurement",
  "document",
  "message",
  "reflection",
  "insight",
  // Finance evidence (unified Insighter cites these once financial context is gathered):
  "account",
  "transaction",
  "budget",
  "holding",
]);
export type EvidenceRefType = z.infer<typeof evidenceRefType>;

export const evidenceRefSchema = z.object({
  refType: evidenceRefType,
  refId: z.string().min(1),
  quote: z.string().optional(),
  score: z.number().optional(),
});
export type EvidenceRef = z.infer<typeof evidenceRefSchema>;

export const insightSchema = z.object({
  id: z.string(),
  topic: z.string(),
  body: z.string(),
  rationale: z.string().optional(),
  sourceFactIds: z.array(z.string()).default([]),
  evidenceRefs: z.array(evidenceRefSchema).default([]),
  /** 1 = normal, 2 = worth noticing, 3 = needs attention. Agent-assigned. */
  priority: insightPriority.default(1),
  createdAt: z.number().int(),
  actedOnAt: z.number().int().nullable().optional(),
  dismissedAt: z.number().int().nullable().optional(),
  snoozedUntil: z.number().int().nullable().optional(),
  /**
   * Provenance for the "acted" state: when the user creates an entity directly
   * from the inbox card, these record what was created. NULL for insights acted
   * on without a concrete entity (or dismissed). See migration
   * 1780051448_add_insight_acted_entity.
   */
  actedEntityType: z.enum(["goal", "task", "habit"]).nullable().optional(),
  actedEntityId: z.string().nullable().optional(),
});
export type Insight = z.infer<typeof insightSchema>;

export const newInsightSchema = insightSchema.omit({
  id: true,
  createdAt: true,
  actedOnAt: true,
  dismissedAt: true,
  snoozedUntil: true,
  actedEntityType: true,
  actedEntityId: true,
});
export type NewInsight = z.input<typeof newInsightSchema>;

/**
 * Request contract for creating an entity directly from an inbox card
 * (POST /api/inbox/:id/create-entity). One source of truth shared by the server
 * route (parses it) and the web client (derives its request body type via
 * z.input, so the goal `kind` default stays optional for callers).
 */
export const createEntityFromInsightInput = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("goal"),
    title: z.string().min(1),
    kind: goalKind.default("outcome"),
    outcome: z.string().optional(),
  }),
  z.object({
    type: z.literal("habit"),
    title: z.string().min(1),
    cadence: habitCadence,
  }),
  z.object({
    type: z.literal("task"),
    title: z.string().min(1),
    dueAt: z.number().int().optional().describe("Epoch milliseconds"),
    notes: z.string().optional(),
  }),
]);
/** Caller-facing request body (goal `kind` optional — server applies the default). */
export type CreateEntityFromInsightInput = z.input<typeof createEntityFromInsightInput>;
/** Parsed/validated input (goal `kind` resolved to its default). */
export type CreateEntityFromInsightParsed = z.infer<typeof createEntityFromInsightInput>;

export type InsightState = "active" | "acted" | "dismissed" | "snoozed";
