import { Hono } from "hono";
import { z } from "zod";
import type { Lifecoach } from "@lifecoach/core";
import {
  habitCadence,
  habitStatus,
  newHabitSchema,
  habitUpdateSchema,
} from "@lifecoach/schemas";
import { parseOptionalEnumQuery } from "../lib/query.js";

// ── Request body schemas ──────────────────────────────────────────────────────

const habitCreateSchema = newHabitSchema;

const habitUpdateRouteSchema = habitUpdateSchema;

const completeBodySchema = z.object({
  /** ISO date string (YYYY-MM-DD). Defaults to today (server local). */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  notes: z.string().optional(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Convert a YYYY-MM-DD string to epoch milliseconds representing local noon
 * on that date.  Using local noon rather than midnight avoids timezone edge
 * cases where a UTC midnight lands on the previous day in negative-offset
 * zones.
 */
const dateToNoonMs = (dateStr: string): number => {
  const [year, month, day] = dateStr.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const d = new Date(year, month - 1, day, 12, 0, 0, 0);
  return d.getTime();
};

const todayIso = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// ── Route factory ─────────────────────────────────────────────────────────────

export const habitRoutes = (lc: Lifecoach): Hono => {
  const app = new Hono();

  // GET /api/habits/month-batch?habitIds=a,b&year=2026&month=5
  // Must come before /:id to avoid param collision.
  app.get("/month-batch", (c) => {
    const rawIds = c.req.query("habitIds") ?? "";
    const habitIds = rawIds
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const year = Number(c.req.query("year") ?? new Date().getFullYear());
    const month = Number(c.req.query("month") ?? new Date().getMonth() + 1);

    if (habitIds.length === 0) {
      return c.json({ byHabit: {} });
    }

    const { fromMs, toMs } = monthWindow(year, month);
    const byHabitMap = lc.storage.habitCompletions.countByDayForHabits(
      habitIds,
      fromMs,
      toMs,
    );

    const byHabit: Record<string, Record<string, number>> = {};
    for (const id of habitIds) {
      const days = byHabitMap.get(id);
      byHabit[id] = days ? Object.fromEntries(days) : {};
    }

    return c.json({ byHabit });
  });

  // GET /api/habits
  app.get("/", (c) => {
    const statusRaw = c.req.query("status");
    const parentGoalId = c.req.query("parentGoalId");

    const status = parseOptionalEnumQuery(statusRaw, [
      "active",
      "paused",
      "archived",
    ]);

    const habits = lc.storage.habits.list({
      ...(status !== undefined ? { status } : {}),
      ...(parentGoalId !== undefined ? { parentGoalId } : {}),
    });

    return c.json({ habits });
  });

  // POST /api/habits
  app.post("/", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = habitCreateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
    }
    const habit = lc.storage.habits.create(parsed.data);
    return c.json({ habit }, 201);
  });

  // GET /api/habits/:id
  app.get("/:id", (c) => {
    const id = c.req.param("id");
    const habit = lc.storage.habits.get(id);
    if (!habit) return c.json({ error: "not_found" }, 404);

    const recentCompletions = lc.storage.habitCompletions.listForHabit(id, {
      limit: 10,
    });

    return c.json({ habit, recentCompletions });
  });

  // PATCH /api/habits/:id
  app.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => null);
    const parsed = habitUpdateRouteSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
    }
    const updated = lc.storage.habits.update(id, parsed.data);
    if (!updated) return c.json({ error: "not_found" }, 404);
    return c.json({ habit: updated });
  });

  // POST /api/habits/:id/complete
  app.post("/:id/complete", async (c) => {
    const id = c.req.param("id");
    const habit = lc.storage.habits.get(id);
    if (!habit) return c.json({ error: "not_found" }, 404);

    const body = await c.req.json().catch(() => ({}));
    const parsed = completeBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
    }

    const dateStr = parsed.data.date ?? todayIso();
    const completedAt = dateToNoonMs(dateStr);

    // Create the completion row and stamp last_completed_at atomically.
    const { completion, habit: updated } = lc.storage.handle.db.transaction(() => {
      const completion = lc.storage.habitCompletions.create({
        habitId: id,
        completedAt,
        notes: parsed.data.notes ?? null,
        origin: "manual",
      });
      lc.storage.habits.setLastCompleted(id, completedAt);
      const updatedHabit = lc.storage.habits.get(id)!;
      return { completion, habit: updatedHabit };
    })();

    return c.json({ completion, habit: updated }, 201);
  });

  // DELETE /api/habits/:id/completions/:completionId — undo a completion
  app.delete("/:id/completions/:completionId", (c) => {
    const completionId = c.req.param("completionId");
    lc.storage.habitCompletions.delete(completionId);
    return c.json({ ok: true });
  });

  // GET /api/habits/:id/month?year=2026&month=5
  app.get("/:id/month", (c) => {
    const id = c.req.param("id");
    if (!lc.storage.habits.get(id)) return c.json({ error: "not_found" }, 404);

    const year = Number(c.req.query("year") ?? new Date().getFullYear());
    const month = Number(c.req.query("month") ?? new Date().getMonth() + 1);

    const { fromMs, toMs } = monthWindow(year, month);
    const byDayMap = lc.storage.habitCompletions.countByDayForHabits(
      [id],
      fromMs,
      toMs,
    );

    const days = byDayMap.get(id) ?? new Map<string, number>();
    return c.json({ year, month, completions: Object.fromEntries(days) });
  });

  // DELETE /api/habits/:id — soft archive
  app.delete("/:id", (c) => {
    const id = c.req.param("id");
    if (!lc.storage.habits.get(id)) return c.json({ error: "not_found" }, 404);
    lc.storage.habits.archive(id);
    return c.json({ ok: true });
  });

  return app;
};

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Compute the inclusive [fromMs, toMs) window for a calendar month in server-
 * local time.  toMs is the first millisecond of the *next* month so the range
 * is exclusive-upper-bound (consistent with every other date range in this
 * codebase).
 */
const monthWindow = (
  year: number,
  month: number,
): { fromMs: number; toMs: number } => {
  const fromMs = new Date(year, month - 1, 1, 0, 0, 0, 0).getTime();
  const toMs = new Date(year, month, 1, 0, 0, 0, 0).getTime();
  return { fromMs, toMs };
};

// Re-export the enum schemas so the routes file is self-contained if callers
// need them for further parsing (e.g. batch endpoints).
export { habitCadence, habitStatus };
