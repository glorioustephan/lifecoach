import { Hono } from "hono";
import { z } from "zod";
import type { Lifecoach } from "@lifecoach/core";

const taskLinkSchema = z.object({
  goalId: z.string().nullable(),
  milestoneId: z.string().nullable().optional(),
});

export const taskRoutes = (lc: Lifecoach) => {
  const app = new Hono();

  app.get("/", (c) => {
    const status = (c.req.query("status") ?? "active") as
      | "active"
      | "completed"
      | "overdue"
      | "all";
    const limit = Number(c.req.query("limit") ?? "25");
    const page = Number(c.req.query("page") ?? "1");
    const offset = (page - 1) * limit;
    const projectId = c.req.query("projectId");

    const filterParams = {
      status,
      limit,
      offset,
      ...(projectId ? { projectId } : {}),
    };

    const tasks = lc.storage.tasks.list(filterParams);
    const total = lc.storage.tasks.count({
      status,
      ...(projectId ? { projectId } : {}),
    });

    return c.json({ tasks, total });
  });

  app.get("/:id", (c) => {
    const task = lc.storage.tasks.get(c.req.param("id"));
    if (!task) return c.json({ error: "not_found" }, 404);
    return c.json({ task });
  });

  app.post("/:id/complete", async (c) => {
    const id = c.req.param("id");
    const task = lc.storage.tasks.get(id);
    if (!task) return c.json({ error: "not_found" }, 404);

    // Complete in Todoist if it's a Todoist task
    if (task.externalSource === "todoist" && task.externalId && lc.todoist) {
      try {
        await lc.todoist.completeTask(task.externalId);
      } catch (err) {
        console.error(`Failed to complete task in Todoist: ${err}`);
      }
    }

    // Update local storage
    lc.storage.tasks.completeTask(id);

    return c.json({ ok: true });
  });

  // Link / un-link a task to a goal (and optionally a milestone). Sending
  // `goalId: null` clears the association; sending a goalId without a
  // milestoneId leaves the link at the goal level.
  app.post("/:id/link", async (c) => {
    const id = c.req.param("id");
    if (!lc.storage.tasks.get(id)) return c.json({ error: "not_found" }, 404);
    const body = await c.req.json().catch(() => null);
    const parsed = taskLinkSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
    }
    const updated = lc.storage.tasks.linkToGoal(
      id,
      parsed.data.goalId,
      parsed.data.milestoneId ?? null,
    );
    return c.json({ task: updated });
  });

  return app;
};
