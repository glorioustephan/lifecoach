import { Hono } from "hono";
import type { Lifecoach } from "@lifecoach/core";
import { syncTodoist } from "@lifecoach/core";

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
          connected: Boolean(process.env["CAPACITIES_API_TOKEN"]),
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

  return app;
};
