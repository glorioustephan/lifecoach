import { Hono } from "hono";
import { z } from "zod";
import type { Lifecoach } from "@lifecoach/core";
import {
  createEntityFromInsightInput,
  type CreateEntityFromInsightParsed,
} from "@lifecoach/schemas";
import { parseEnumQuery, parsePagination } from "../lib/query.js";

const snoozeSchema = z.object({
  until: z.union([z.number().int(), z.string()]),
});

// Single create site keyed on the discriminator — the markActedWithEntity stamp
// then has exactly one call site, so a future entity type can't be added with
// the create but without the provenance stamp.
const createEntityFromInput = (lc: Lifecoach, input: CreateEntityFromInsightParsed) => {
  switch (input.type) {
    case "goal":
      return {
        type: "goal" as const,
        entity: lc.storage.goals.create({
          title: input.title,
          kind: input.kind,
          status: "active",
          horizon: "open",
          reviewCadence: "weekly",
          ...(input.outcome ? { outcome: input.outcome } : {}),
        }),
      };
    case "habit":
      return {
        type: "habit" as const,
        entity: lc.storage.habits.create({ title: input.title, cadence: input.cadence }),
      };
    case "task":
      return {
        type: "task" as const,
        entity: lc.storage.tasks.create({
          content: input.title,
          dueAt: input.dueAt ?? null,
          description: input.notes ?? null,
        }),
      };
  }
};

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
    const state = parseEnumQuery(
      c.req.query("state"),
      ["active", "acted", "dismissed", "snoozed", "all"],
      "active",
    );
    const { limit, offset } = parsePagination((key) => c.req.query(key), {
      defaultLimit: 25,
      maxLimit: 100,
    });
    const total = lc.storage.insights.count({ state });
    const insights = lc.storage.insights.list({ state, limit, offset });
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

  // Create a goal/habit/task from an insight, then mark the insight acted with
  // provenance — atomically, so a card is never "acted" without its entity (or
  // vice versa). The acted_entity_* stamp is what gives "Acted" concrete meaning
  // distinct from "Dismissed".
  app.post("/:id/create-entity", async (c) => {
    const id = c.req.param("id");
    const ins = lc.storage.insights.get(id);
    if (!ins) return c.json({ error: "not_found" }, 404);

    // Reject if the insight is already resolved or has already spawned an
    // entity. Unlike the idempotent act/dismiss stamps, this endpoint inserts a
    // row, so an unguarded repeat (retry, two tabs, a reactivated card that
    // already created something) would duplicate the entity, orphan the prior
    // provenance, and — since state is derived from independent columns — could
    // leave a row showing under both the Acted and Dismissed tabs.
    if (ins.actedOnAt || ins.dismissedAt || ins.actedEntityId) {
      return c.json({ error: "already_resolved" }, 409);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = createEntityFromInsightInput.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
    }
    const input = parsed.data;

    try {
      // Cross-table transactional write (entity insert + insight stamp) —
      // sanctioned exception, same pattern as routes/propose.ts.
      const result = lc.storage.handle.db.transaction(() => {
        const created = createEntityFromInput(lc, input);
        lc.storage.insights.markActedWithEntity(id, created.type, created.entity.id);
        return created;
      })();

      return c.json(result, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: "transaction_failed", message }, 500);
    }
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
