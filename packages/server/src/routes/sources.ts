import { Hono } from "hono";
import type { Lifecoach } from "@lifecoach/core";
import { syncTodoist, syncCapacities, CAPACITIES_SOURCE } from "@lifecoach/core";

export const sourceRoutes = (lc: Lifecoach) => {
  const app = new Hono();

  app.get("/", (c) => {
    return c.json({
      sources: [
        {
          id: "todoist",
          name: "Todoist",
          connected: lc.todoist != null,
          tasks: lc.storage.tasks.list({ status: "active", limit: 1_000_000 }).length,
        },
        {
          id: "file-drop",
          name: "File drop",
          connected: true,
          watchedPath: lc.config.rawDir,
          ingestedFiles: lc.storage.ingestedFiles.count(),
        },
        {
          id: "google-calendar",
          name: "Google Calendar",
          connected: false,
        },
        {
          id: "gmail",
          name: "Gmail",
          connected: false,
        },
        {
          id: "capacities",
          name: "Capacities",
          connected: lc.capacities != null,
          defaultSpaceId: lc.config.capacitiesDefaultSpaceId ?? null,
          mirroredObjects: lc.storage.documents.count({ externalSource: CAPACITIES_SOURCE }),
        },
      ],
    });
  });

  app.post("/todoist/sync", async (c) => {
    if (!lc.todoist) return c.json({ error: "todoist_not_configured" }, 400);
    try {
      const result = await syncTodoist(lc.todoist, lc.storage, lc.embedder);
      return c.json({ result });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.post("/capacities/sync", async (c) => {
    if (!lc.capacities) return c.json({ error: "capacities_not_configured" }, 400);
    try {
      const body = await c.req.json().catch(() => ({}));
      const pruneMissing = body?.pruneMissing === true;
      const searchTerms = Array.isArray(body?.searchTerms) ? body.searchTerms : undefined;
      const result = await syncCapacities(lc.capacities, lc.storage, lc.embedder, {
        pruneMissing,
        ...(searchTerms ? { searchTerms } : {}),
      });
      return c.json({ result });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.get("/capacities/spaces", async (c) => {
    if (!lc.capacities) return c.json({ error: "capacities_not_configured" }, 400);
    try {
      const spaces = await lc.capacities.listSpaces();
      return c.json({ spaces });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  return app;
};
