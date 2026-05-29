/**
 * POST /api/propose/bulk
 *
 * Bulk-create endpoint for the ProposalReviewModal. Accepts an optional goal to
 * create first, then creates habits and tasks linked to that goal (or an existing
 * one). The entire operation runs in a single SQLite transaction — if any row
 * fails, all are rolled back.
 *
 * Sanctioned raw-DB access: cross-table transactional write across goals, habits,
 * and tasks — the same pattern used by memory/forget.ts and ingest/pipeline.ts.
 * See packages/core/src/storage/repositories/memory.md §Sanctioned exceptions.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { Lifecoach } from "@lifecoach/core";
import { habitCadence } from "@lifecoach/schemas";
import type { Goal, Habit, Task } from "@lifecoach/schemas";

// ── Request schema ────────────────────────────────────────────────────────────

const proposeBulkSchema = z
  .object({
    goalToCreate: z
      .object({
        title: z.string().min(1),
        kind: z.enum(["outcome", "process", "identity"]),
        outcome: z.string().optional(),
      })
      .optional(),
    parentGoalId: z.string().optional(),
    items: z
      .array(
        z.discriminatedUnion("type", [
          z.object({
            type: z.literal("habit"),
            title: z.string().min(1),
            cadence: habitCadence,
            notes: z.string().optional(),
          }),
          z.object({
            type: z.literal("task"),
            title: z.string().min(1),
            dueAt: z.number().optional().describe("Epoch milliseconds"),
            notes: z.string().optional(),
          }),
        ]),
      )
      .min(1, "At least one item is required")
      .max(12, "Maximum 12 items per bulk-create"),
  })
  .refine(
    (d) => !(d.goalToCreate && d.parentGoalId),
    "goalToCreate and parentGoalId are mutually exclusive — provide at most one",
  );

// ── Re-export types used by the web client ────────────────────────────────────

export type ProposeBulkBody = z.infer<typeof proposeBulkSchema>;

export interface ProposeBulkResponse {
  goal?: Goal;
  habits: Habit[];
  tasks: Task[];
}

// ── Route factory ─────────────────────────────────────────────────────────────

export const proposeRoutes = (lc: Lifecoach): Hono => {
  const app = new Hono();

  /**
   * POST /api/propose/bulk
   *
   * Single transaction:
   *   1. If goalToCreate is set, create the goal → capture its id.
   *   2. Resolve targetGoalId = newGoal.id ?? parentGoalId ?? null.
   *   3. For each habit item, create via storage.habits.create.
   *   4. For each task item, create via storage.tasks.create.
   *   5. Return { goal?, habits, tasks }.
   */
  app.post("/bulk", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = proposeBulkSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
    }

    const { goalToCreate, parentGoalId, items } = parsed.data;

    try {
      // Cross-table transactional write — sanctioned exception (see module doc).
      const result = lc.storage.handle.db.transaction(() => {
        // Step 1: optionally create the goal first so we have its id.
        let createdGoal: ReturnType<typeof lc.storage.goals.create> | undefined;
        if (goalToCreate) {
          createdGoal = lc.storage.goals.create({
            title: goalToCreate.title,
            kind: goalToCreate.kind,
            status: "active",
            horizon: "open",
            reviewCadence: "weekly",
            ...(goalToCreate.outcome ? { outcome: goalToCreate.outcome } : {}),
          });
        }

        // Step 2: resolve the target goal id.
        const targetGoalId = createdGoal?.id ?? parentGoalId ?? null;

        // Step 3 + 4: create each item in declaration order.
        const habits: ReturnType<typeof lc.storage.habits.create>[] = [];
        const tasks: ReturnType<typeof lc.storage.tasks.create>[] = [];

        for (const item of items) {
          if (item.type === "habit") {
            habits.push(
              lc.storage.habits.create({
                title: item.title,
                cadence: item.cadence,
                parentGoalId: targetGoalId,
                notes: item.notes ?? null,
              }),
            );
          } else {
            tasks.push(
              lc.storage.tasks.create({
                content: item.title,
                dueAt: item.dueAt ?? null,
                goalId: targetGoalId,
                description: item.notes ?? null,
              }),
            );
          }
        }

        return { goal: createdGoal, habits, tasks };
      })();

      return c.json(
        {
          ...(result.goal ? { goal: result.goal } : {}),
          habits: result.habits,
          tasks: result.tasks,
        },
        201,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: "transaction_failed", message }, 500);
    }
  });

  return app;
};
