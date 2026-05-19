import { Hono } from "hono";
import type { Lifecoach } from "@lifecoach/core";

export const taskRoutes = (lc: Lifecoach) => {
  const app = new Hono();

  app.get("/", (c) => {
    const status = (c.req.query("status") ?? "active") as
      | "active"
      | "completed"
      | "overdue"
      | "all";
    const limit = Number(c.req.query("limit") ?? "100");
    const projectId = c.req.query("projectId");
    return c.json({
      tasks: lc.storage.tasks.list({
        status,
        limit,
        ...(projectId ? { projectId } : {}),
      }),
    });
  });

  app.get("/:id", (c) => {
    const task = lc.storage.tasks.get(c.req.param("id"));
    if (!task) return c.json({ error: "not_found" }, 404);
    return c.json({ task });
  });

  return app;
};
