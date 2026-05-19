import { Hono } from "hono";
import type { Lifecoach } from "@lifecoach/core";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The morning briefing endpoint composes a single response from every system
 * that matters for "what to know about today":
 *   - overdue + due-today tasks
 *   - active goals with their progress
 *   - top fresh insights (priority desc, last 7d)
 *   - latest weekly reflection (title + 1-line opener)
 *   - quick stats so the UI can render a status strip
 */
export const briefingRoutes = (lc: Lifecoach) => {
  const app = new Hono();

  app.get("/", (c) => {
    const nowMs = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = todayStart.getTime() + ONE_DAY_MS;

    // Tasks — overdue + due today
    const allActive = lc.storage.tasks.list({ status: "active", limit: 1_000_000 });
    const overdue = allActive.filter(
      (t) => t.dueAt !== null && t.dueAt !== undefined && t.dueAt < todayStart.getTime(),
    );
    const dueToday = allActive.filter(
      (t) =>
        t.dueAt !== null &&
        t.dueAt !== undefined &&
        t.dueAt >= todayStart.getTime() &&
        t.dueAt < tomorrowStart,
    );

    // Goals — active, sorted by horizon priority + due_at
    const activeGoals = lc.storage.goals.list({ status: "active", limit: 50 });

    // Insights — fresh top-priority active ones (last 7d)
    const insights = lc.storage.insights
      .list({ state: "active", limit: 20 })
      .filter((i) => i.createdAt > nowMs - 7 * ONE_DAY_MS)
      .slice(0, 3);

    // Latest reflection (any kind)
    const reflectionRow = lc.storage.handle.db
      .prepare(
        `SELECT id, kind, period_start, period_end, body, created_at
         FROM reflections ORDER BY period_end DESC LIMIT 1`,
      )
      .get() as
      | {
          id: string;
          kind: string;
          period_start: number;
          period_end: number;
          body: string;
          created_at: number;
        }
      | undefined;

    return c.json({
      generatedAt: nowMs,
      tasks: {
        overdue: overdue.slice(0, 10),
        dueToday: dueToday.slice(0, 10),
        totalActive: allActive.length,
      },
      goals: {
        active: activeGoals.slice(0, 8),
        totalActive: activeGoals.length,
      },
      insights,
      reflection: reflectionRow ?? null,
    });
  });

  return app;
};
