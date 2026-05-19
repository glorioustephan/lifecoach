import { Hono } from "hono";
import { z } from "zod";
import type { Lifecoach } from "@lifecoach/core";

const goalCreateSchema = z.object({
  title: z.string().min(1),
  body: z.string().optional(),
  horizon: z.enum(["this-week", "this-month", "this-quarter", "this-year", "open"]).optional(),
  successCriteria: z.string().optional(),
  dueAt: z.number().int().optional(),
  targetMetric: z.string().optional(),
  targetValue: z.number().optional(),
  projectId: z.string().optional(),
  parentGoalId: z.string().optional(),
});

const goalUpdateSchema = z.object({
  status: z.enum(["active", "paused", "done", "abandoned"]).optional(),
  currentProgress: z.number().optional(),
  body: z.string().optional(),
  successCriteria: z.string().optional(),
  targetValue: z.number().optional(),
});

const projectCreateSchema = z.object({
  title: z.string().min(1),
  body: z.string().optional(),
  targetDate: z.number().int().optional(),
});

export const goalRoutes = (lc: Lifecoach) => {
  const app = new Hono();

  app.get("/", (c) => {
    const status = (c.req.query("status") ?? "active") as never;
    const horizon = c.req.query("horizon");
    const projectId = c.req.query("projectId");
    return c.json({
      goals: lc.storage.goals.list({
        status,
        ...(horizon ? { horizon: horizon as never } : {}),
        ...(projectId ? { projectId } : {}),
        limit: 200,
      }),
    });
  });

  app.post("/", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = goalCreateSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
    const goal = lc.storage.goals.create({
      title: parsed.data.title,
      body: parsed.data.body ?? null,
      horizon: parsed.data.horizon ?? "open",
      status: "active",
      successCriteria: parsed.data.successCriteria ?? null,
      parentGoalId: parsed.data.parentGoalId ?? null,
      projectId: parsed.data.projectId ?? null,
      targetMetric: parsed.data.targetMetric ?? null,
      targetValue: parsed.data.targetValue ?? null,
      currentProgress: null,
      dueAt: parsed.data.dueAt ?? null,
    });
    return c.json({ goal });
  });

  app.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => null);
    const parsed = goalUpdateSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
    const updated = lc.storage.goals.updateProgress(id, parsed.data);
    if (!updated) return c.json({ error: "not_found" }, 404);
    return c.json({ goal: updated });
  });

  app.delete("/:id", (c) => {
    const id = c.req.param("id");
    const ex = lc.storage.goals.get(id);
    if (!ex) return c.json({ error: "not_found" }, 404);
    lc.storage.goals.delete(id);
    return c.json({ ok: true });
  });

  // Projects, mounted under /projects (also accessible from /goals/projects for cohesion).
  const projects = new Hono();
  projects.get("/", (c) => {
    const status = (c.req.query("status") ?? "active") as never;
    return c.json({ projects: lc.storage.projects.list({ status, limit: 100 }) });
  });
  projects.post("/", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = projectCreateSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
    const project = lc.storage.projects.create({
      title: parsed.data.title,
      body: parsed.data.body ?? null,
      status: "active",
      targetDate: parsed.data.targetDate ?? null,
    });
    return c.json({ project });
  });
  projects.patch("/:id/status", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => null);
    const parsed = z
      .object({ status: z.enum(["active", "paused", "done", "abandoned"]) })
      .safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
    const ex = lc.storage.projects.get(id);
    if (!ex) return c.json({ error: "not_found" }, 404);
    lc.storage.projects.updateStatus(id, parsed.data.status);
    return c.json({ ok: true });
  });

  app.route("/projects", projects);

  return app;
};
