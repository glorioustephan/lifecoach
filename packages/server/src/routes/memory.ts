import { Hono } from "hono";
import { z } from "zod";
import type { Lifecoach } from "@lifecoach/core";
import { forgetDocument, kindWindow } from "@lifecoach/core";

const reflectSchema = z.object({
  kind: z.enum(["daily", "weekly", "monthly"]),
  from: z.number().int().optional(),
  to: z.number().int().optional(),
});

const recallSchema = z.object({
  query: z.string().min(1),
  scope: z.enum(["facts", "documents", "messages", "reflections", "tasks", "all"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const memoryRoutes = (lc: Lifecoach) => {
  const app = new Hono();

  // Facts list — basic for now; filter by category, status (active=null valid_to).
  app.get("/facts", (c) => {
    const category = c.req.query("category");
    const includeExpired = c.req.query("includeExpired") === "true";
    if (category) {
      return c.json({
        facts: lc.storage.facts.byCategory(category as never, includeExpired),
      });
    }
    // No category filter — return all categories (simple approach for now).
    const categories = [
      "health",
      "preference",
      "recipe",
      "task",
      "routine",
      "goal",
      "relationship",
      "other",
    ] as const;
    const facts = categories.flatMap((cat) =>
      lc.storage.facts.byCategory(cat, includeExpired),
    );
    return c.json({ facts });
  });

  // Documents list.
  app.get("/documents", (c) => {
    const stmt = lc.storage.handle.db.prepare(
      "SELECT id, source, mime, title, length(body) as body_chars, ingested_at FROM documents ORDER BY ingested_at DESC LIMIT 200",
    );
    return c.json({ documents: stmt.all() });
  });

  // Forget a document and everything derived from it. Destructive but
  // bounded — only touches things derived from this document id.
  app.delete("/documents/:id", (c) => {
    const id = c.req.param("id");
    try {
      const result = forgetDocument(lc.storage, id);
      return c.json({ result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.startsWith("No document") ? 404 : 500;
      return c.json({ error: message }, status);
    }
  });

  // Measurements time-series for one metric.
  app.get("/measurements", (c) => {
    const metric = c.req.query("metric");
    if (!metric) return c.json({ error: "metric required" }, 400);
    const from = c.req.query("from") ? Number(c.req.query("from")) : undefined;
    const to = c.req.query("to") ? Number(c.req.query("to")) : undefined;
    return c.json({
      measurements: lc.storage.measurements.query(metric, {
        ...(from !== undefined ? { from } : {}),
        ...(to !== undefined ? { to } : {}),
      }),
    });
  });

  // Reflections — list (newest first).
  app.get("/reflections", (c) => {
    const rows = lc.storage.handle.db
      .prepare(
        "SELECT id, period_start, period_end, kind, body, created_at FROM reflections ORDER BY period_end DESC LIMIT 100",
      )
      .all();
    return c.json({ reflections: rows });
  });

  // Reflections — generate a new one over a period. Falls back to the spec's
  // default window for the kind if from/to aren't provided.
  app.post("/reflections/generate", async (c) => {
    if (!lc.reflector) {
      return c.json({ error: "anthropic_not_configured" }, 400);
    }
    const body = await c.req.json().catch(() => null);
    const parsed = reflectSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
    }
    const defaults = kindWindow(parsed.data.kind);
    const from = parsed.data.from ?? defaults.from;
    const to = parsed.data.to ?? defaults.to;
    try {
      const reflection = await lc.reflector.generate(
        lc.storage,
        lc.memory.identity,
        parsed.data.kind,
        from,
        to,
      );
      return c.json({ reflection });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : String(err) },
        500,
      );
    }
  });

  // Cross-scope semantic search.
  app.post("/recall", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = recallSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
    const hits = await lc.memory.semantic.recall(parsed.data.query, {
      ...(parsed.data.scope ? { scope: parsed.data.scope } : {}),
      ...(parsed.data.limit !== undefined ? { limit: parsed.data.limit } : {}),
    });
    return c.json({ hits });
  });

  return app;
};
