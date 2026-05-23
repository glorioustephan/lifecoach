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

  return app;
};
