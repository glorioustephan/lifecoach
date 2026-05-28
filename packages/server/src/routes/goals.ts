import { Hono } from "hono";
import { z } from "zod";
import type { Lifecoach } from "@lifecoach/core";
import { indexGoal, indexMilestone } from "@lifecoach/core";

const goalKind = z.enum(["outcome", "process", "identity"]);
const goalCadence = z.enum(["daily", "weekly", "monthly"]);
const reviewCadence = z.enum(["weekly", "monthly", "quarterly", "as-needed"]);

// Create accepts the expanded WOOP / kind / cadence surface from the goal
// edit Sheet. All new fields are optional; defaults match the schema layer.
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
  // Phase 1 additions:
  kind: goalKind.optional(),
  cadence: goalCadence.optional(),
  outcome: z.string().optional(),
  obstacle: z.string().optional(),
  implementationIntention: z.string().optional(),
  identityStatement: z.string().optional(),
  reviewCadence: reviewCadence.optional(),
});

// Update accepts every patchable field. `undefined` leaves a field alone;
// `null` clears it (mirrors GoalRepository.update semantics).
const goalUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  status: z.enum(["active", "paused", "done", "abandoned"]).optional(),
  currentProgress: z.number().nullable().optional(),
  body: z.string().nullable().optional(),
  horizon: z.enum(["this-week", "this-month", "this-quarter", "this-year", "open"]).optional(),
  successCriteria: z.string().nullable().optional(),
  targetValue: z.number().nullable().optional(),
  targetMetric: z.string().nullable().optional(),
  dueAt: z.number().int().nullable().optional(),
  kind: goalKind.optional(),
  cadence: goalCadence.nullable().optional(),
  outcome: z.string().nullable().optional(),
  obstacle: z.string().nullable().optional(),
  implementationIntention: z.string().nullable().optional(),
  identityStatement: z.string().nullable().optional(),
  reviewCadence: reviewCadence.optional(),
  archivedAt: z.number().int().nullable().optional(),
});

const milestoneCreateSchema = z.object({
  title: z.string().min(1),
  body: z.string().optional(),
  dueAt: z.number().int().optional(),
  orderIndex: z.number().int().optional(),
});

const milestoneUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  body: z.string().nullable().optional(),
  status: z.enum(["pending", "active", "done", "abandoned"]).optional(),
  orderIndex: z.number().int().optional(),
  dueAt: z.number().int().nullable().optional(),
});

const milestoneReorderSchema = z.object({
  ids: z.array(z.string()).min(1),
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
    const kind = c.req.query("kind");
    const projectId = c.req.query("projectId");
    return c.json({
      goals: lc.storage.goals.list({
        status,
        ...(horizon ? { horizon: horizon as never } : {}),
        ...(kind ? { kind: kind as never } : {}),
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
      kind: parsed.data.kind ?? "outcome",
      cadence: parsed.data.cadence ?? null,
      outcome: parsed.data.outcome ?? null,
      obstacle: parsed.data.obstacle ?? null,
      implementationIntention: parsed.data.implementationIntention ?? null,
      identityStatement: parsed.data.identityStatement ?? null,
      successCriteria: parsed.data.successCriteria ?? null,
      parentGoalId: parsed.data.parentGoalId ?? null,
      projectId: parsed.data.projectId ?? null,
      targetMetric: parsed.data.targetMetric ?? null,
      targetValue: parsed.data.targetValue ?? null,
      currentProgress: null,
      reviewCadence: parsed.data.reviewCadence ?? "weekly",
      dueAt: parsed.data.dueAt ?? null,
    });
    // Fire-and-forget embed so a slow Voyage call never blocks the UI response.
    // Errors are swallowed deliberately; the cron re-indexes nightly if needed.
    void indexGoal(lc.storage, lc.embedder, goal).catch(() => undefined);
    return c.json({ goal });
  });

  app.get("/:id", (c) => {
    const goal = lc.storage.goals.get(c.req.param("id"));
    if (!goal) return c.json({ error: "not_found" }, 404);
    return c.json({ goal });
  });

  app.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => null);
    const parsed = goalUpdateSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
    const updated = lc.storage.goals.update(id, parsed.data);
    if (!updated) return c.json({ error: "not_found" }, 404);
    void indexGoal(lc.storage, lc.embedder, updated).catch(() => undefined);
    return c.json({ goal: updated });
  });

  app.post("/:id/archive", (c) => {
    const updated = lc.storage.goals.archive(c.req.param("id"));
    if (!updated) return c.json({ error: "not_found" }, 404);
    return c.json({ goal: updated });
  });

  app.post("/:id/unarchive", (c) => {
    const updated = lc.storage.goals.unarchive(c.req.param("id"));
    if (!updated) return c.json({ error: "not_found" }, 404);
    return c.json({ goal: updated });
  });

  app.delete("/:id", (c) => {
    const id = c.req.param("id");
    const ex = lc.storage.goals.get(id);
    if (!ex) return c.json({ error: "not_found" }, 404);
    lc.storage.goals.delete(id);
    lc.storage.embeddings.deleteForRef("goal", id);
    return c.json({ ok: true });
  });

  // ── Milestones nested under /goals/:goalId/milestones ───────────────────────
  app.get("/:goalId/milestones", (c) => {
    const goalId = c.req.param("goalId");
    if (!lc.storage.goals.get(goalId)) return c.json({ error: "not_found" }, 404);
    return c.json({
      milestones: lc.storage.milestones.list({ goalId, limit: 200 }),
    });
  });

  app.post("/:goalId/milestones", async (c) => {
    const goalId = c.req.param("goalId");
    if (!lc.storage.goals.get(goalId)) return c.json({ error: "not_found" }, 404);
    const body = await c.req.json().catch(() => null);
    const parsed = milestoneCreateSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
    const milestone = lc.storage.milestones.create({
      goalId,
      title: parsed.data.title,
      body: parsed.data.body ?? null,
      status: "pending",
      orderIndex: parsed.data.orderIndex ?? 0,
      dueAt: parsed.data.dueAt ?? null,
      origin: "manual",
      confidence: null,
    });
    void indexMilestone(lc.storage, lc.embedder, milestone).catch(() => undefined);
    return c.json({ milestone });
  });

  app.patch("/:goalId/milestones/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => null);
    const parsed = milestoneUpdateSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
    const updated = lc.storage.milestones.update(id, parsed.data);
    if (!updated) return c.json({ error: "not_found" }, 404);
    void indexMilestone(lc.storage, lc.embedder, updated).catch(() => undefined);
    return c.json({ milestone: updated });
  });

  app.post("/:goalId/milestones/reorder", async (c) => {
    const goalId = c.req.param("goalId");
    if (!lc.storage.goals.get(goalId)) return c.json({ error: "not_found" }, 404);
    const body = await c.req.json().catch(() => null);
    const parsed = milestoneReorderSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
    lc.storage.milestones.reorder(goalId, parsed.data.ids);
    return c.json({
      milestones: lc.storage.milestones.list({ goalId, limit: 200 }),
    });
  });

  app.delete("/:goalId/milestones/:id", (c) => {
    const id = c.req.param("id");
    const ex = lc.storage.milestones.get(id);
    if (!ex) return c.json({ error: "not_found" }, 404);
    lc.storage.milestones.delete(id);
    lc.storage.embeddings.deleteForRef("milestone", id);
    return c.json({ ok: true });
  });

  // ── Projects, mounted under /projects (also accessible from /goals/projects)
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
