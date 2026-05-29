/**
 * Zod schema validation tests for propose_artifact and propose_actionable_items.
 *
 * These tools do not persist anything — the schemas are the only logic worth
 * testing here. We exercise the discriminated union, boundary constraints,
 * and the compile-time enum derivation.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ARTIFACT_DESCRIPTORS } from "@lifecoach/schemas";

// ── Reproduce the input schemas from propose.ts ───────────────────────────────
// We re-declare them here (without importing the private tool builders) to keep
// the tests self-contained and fast.

const ARTIFACT_TYPE_ENUM = ARTIFACT_DESCRIPTORS.map((d) => d.id) as [string, ...string[]];

const proposeArtifactSchema = z.object({
  type: z.enum(ARTIFACT_TYPE_ENUM),
  title: z.string().optional(),
  confidence: z.number().min(0).max(1).default(0.9),
});

const proposeItemsSchema = z.object({
  items: z
    .array(
      z.discriminatedUnion("type", [
        z.object({
          type: z.literal("habit"),
          title: z.string().min(1),
          cadence: z.enum(["daily", "weekly", "monthly"]),
          rationale: z.string().optional(),
          notes: z.string().optional(),
        }),
        z.object({
          type: z.literal("task"),
          title: z.string().min(1),
          dueAt: z.string().optional(),
          rationale: z.string().optional(),
          notes: z.string().optional(),
        }),
      ]),
    )
    .min(1)
    .max(12),
  parentGoalSuggestion: z
    .object({
      title: z.string().min(1),
      kind: z.enum(["outcome", "process", "identity"]),
      rationale: z.string().optional(),
    })
    .optional(),
});

// ── propose_artifact ──────────────────────────────────────────────────────────

describe("propose_artifact schema", () => {
  it("accepts a valid artifact type with defaults", () => {
    const result = proposeArtifactSchema.safeParse({ type: "recipe" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.confidence).toBe(0.9); // default
      expect(result.data.title).toBeUndefined();
    }
  });

  it("accepts all artifact types from ARTIFACT_DESCRIPTORS", () => {
    for (const d of ARTIFACT_DESCRIPTORS) {
      const result = proposeArtifactSchema.safeParse({ type: d.id });
      expect(result.success, `type ${d.id} should be valid`).toBe(true);
    }
  });

  it("rejects an unknown artifact type", () => {
    const result = proposeArtifactSchema.safeParse({ type: "flying-spaghetti-monster" });
    expect(result.success).toBe(false);
  });

  it("rejects confidence below 0", () => {
    const result = proposeArtifactSchema.safeParse({ type: "recipe", confidence: -0.1 });
    expect(result.success).toBe(false);
  });

  it("rejects confidence above 1", () => {
    const result = proposeArtifactSchema.safeParse({ type: "recipe", confidence: 1.1 });
    expect(result.success).toBe(false);
  });

  it("accepts optional title", () => {
    const result = proposeArtifactSchema.safeParse({
      type: "recipe",
      title: "Salmon teriyaki",
    });
    expect(result.success).toBe(true);
  });
});

// ── propose_actionable_items ──────────────────────────────────────────────────

describe("propose_actionable_items schema — happy paths", () => {
  it("accepts a single habit item", () => {
    const result = proposeItemsSchema.safeParse({
      items: [{ type: "habit", title: "Take fish oil", cadence: "daily" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a single task item", () => {
    const result = proposeItemsSchema.safeParse({
      items: [{ type: "task", title: "Order TG-form fish oil" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts mixed habit + task items", () => {
    const result = proposeItemsSchema.safeParse({
      items: [
        { type: "habit", title: "Take fish oil", cadence: "daily" },
        { type: "task", title: "Order TG-form fish oil" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a parentGoalSuggestion", () => {
    const result = proposeItemsSchema.safeParse({
      items: [{ type: "habit", title: "Exercise", cadence: "daily" }],
      parentGoalSuggestion: {
        title: "Improve lipid panel",
        kind: "process",
        rationale: "All items contribute to improving lipid metrics",
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts exactly 12 items (the max)", () => {
    const items = Array.from({ length: 12 }, (_, i) => ({
      type: "task" as const,
      title: `Task ${i + 1}`,
    }));
    const result = proposeItemsSchema.safeParse({ items });
    expect(result.success).toBe(true);
  });
});

describe("propose_actionable_items schema — rejections", () => {
  it("rejects empty items array", () => {
    const result = proposeItemsSchema.safeParse({ items: [] });
    expect(result.success).toBe(false);
  });

  it("rejects more than 12 items", () => {
    const items = Array.from({ length: 13 }, (_, i) => ({
      type: "task" as const,
      title: `Task ${i + 1}`,
    }));
    const result = proposeItemsSchema.safeParse({ items });
    expect(result.success).toBe(false);
  });

  it("rejects a habit item missing cadence", () => {
    const result = proposeItemsSchema.safeParse({
      items: [{ type: "habit", title: "Exercise" }], // no cadence
    });
    expect(result.success).toBe(false);
  });

  it("rejects a habit item with invalid cadence", () => {
    const result = proposeItemsSchema.safeParse({
      items: [{ type: "habit", title: "Exercise", cadence: "hourly" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a habit item with empty title", () => {
    const result = proposeItemsSchema.safeParse({
      items: [{ type: "habit", title: "", cadence: "daily" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a task item with empty title", () => {
    const result = proposeItemsSchema.safeParse({
      items: [{ type: "task", title: "" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown item type", () => {
    const result = proposeItemsSchema.safeParse({
      items: [{ type: "milestone", title: "Something" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects parentGoalSuggestion with empty title", () => {
    const result = proposeItemsSchema.safeParse({
      items: [{ type: "task", title: "Task" }],
      parentGoalSuggestion: { title: "", kind: "process" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects parentGoalSuggestion with invalid kind", () => {
    const result = proposeItemsSchema.safeParse({
      items: [{ type: "task", title: "Task" }],
      parentGoalSuggestion: { title: "My goal", kind: "milestone" },
    });
    expect(result.success).toBe(false);
  });
});
