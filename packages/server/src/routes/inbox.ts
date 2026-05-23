import { Hono } from "hono";
import { z } from "zod";
import type { Lifecoach } from "@lifecoach/core";

const snoozeSchema = z.object({
  until: z.union([z.number().int(), z.string()]),
});

const parseUntil = (raw: number | string): number | null => {
  if (typeof raw === "number") return raw;
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) return parsed;
  const lower = raw.toLowerCase().trim();
  if (lower === "tomorrow") return Date.now() + 24 * 60 * 60 * 1000;
  if (lower === "next week") return Date.now() + 7 * 24 * 60 * 60 * 1000;
  return null;
};

export const inboxRoutes = (lc: Lifecoach) => {
  const app = new Hono();

  // List insights by state with pagination (default: active).
  app.get("/", (c) => {
    const state = (c.req.query("state") ?? "active") as
      | "active"
      | "acted"
      | "dismissed"
      | "snoozed"
      | "all";
    const limit = Number(c.req.query("limit") ?? "25");
    const page = Number(c.req.query("page") ?? "1");
    const offset = (page - 1) * limit;

    // Get all insights for this state to calculate total
    const allInsights = lc.storage.insights.list({ state, limit: 1_000_000 });
    const total = allInsights.length;

    // Get paginated slice
    const insights = allInsights.slice(offset, offset + limit);
    return c.json({ insights, total });
  });

  // Generate a new pass.
  app.post("/generate", async (c) => {
    if (!lc.insighter) {
      return c.json({ error: "anthropic_not_configured" }, 400);
    }
    try {
      const insights = await lc.insighter.generate(lc.storage, lc.memory.identity);
      return c.json({ insights });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : String(err) },
        500,
      );
    }
  });

  app.post("/:id/act", (c) => {
    const id = c.req.param("id");
    const ins = lc.storage.insights.get(id);
    if (!ins) return c.json({ error: "not_found" }, 404);
    lc.storage.insights.markActed(id);
    return c.json({ ok: true });
  });

  app.post("/:id/dismiss", (c) => {
    const id = c.req.param("id");
    const ins = lc.storage.insights.get(id);
    if (!ins) return c.json({ error: "not_found" }, 404);
    lc.storage.insights.markDismissed(id);
    return c.json({ ok: true });
  });

  app.post("/:id/snooze", async (c) => {
    const id = c.req.param("id");
    const ins = lc.storage.insights.get(id);
    if (!ins) return c.json({ error: "not_found" }, 404);
    const body = await c.req.json().catch(() => null);
    const parsed = snoozeSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
    const untilMs = parseUntil(parsed.data.until);
    if (untilMs === null) return c.json({ error: "invalid_until" }, 400);
    lc.storage.insights.snooze(id, untilMs);
    return c.json({ ok: true, until: untilMs });
  });

  app.post("/:id/reactivate", (c) => {
    const id = c.req.param("id");
    const ins = lc.storage.insights.get(id);
    if (!ins) return c.json({ error: "not_found" }, 404);
    lc.storage.insights.reactivate(id);
    return c.json({ ok: true });
  });

  return app;
};
