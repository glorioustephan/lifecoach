import { Hono } from "hono";
import type { Lifecoach } from "@lifecoach/core";
import {
  syncTodoist,
  syncCapacities,
  CAPACITIES_SOURCE,
  MonarchClient,
  syncMonarch,
  buildMonarchClientFromProfile,
  setMonarchCredentials,
  getMonarchSettings,
  recordMonarchConnected,
  recordMonarchError,
  recordMonarchSync,
} from "@lifecoach/core";

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
        {
          id: "monarch",
          name: "Monarch Money",
          connected: getMonarchSettings(lc.storage).connected,
          accounts: lc.storage.financial.listAccounts({ status: "active" }).length,
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

  // ─── Monarch Money ──────────────────────────────────────────────────────────
  // Status only — never returns the stored email/password/MFA secret.
  app.get("/monarch/settings", (c) => c.json(getMonarchSettings(lc.storage)));

  // Save + validate credentials. Stores encrypted (requires LIFECOACH_SECRET_KEY),
  // then proves them by authenticating against Monarch before reporting success.
  app.post("/monarch/credentials", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      email?: unknown;
      password?: unknown;
      mfaSecret?: unknown;
    };
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const mfaSecret =
      typeof body.mfaSecret === "string" && body.mfaSecret.length > 0 ? body.mfaSecret : undefined;
    if (!email || !password) {
      return c.json({ error: "email and password are required" }, 400);
    }

    try {
      // Fails loudly if LIFECOACH_SECRET_KEY is unset — nothing stored in plaintext.
      setMonarchCredentials(lc.storage, { email, password, ...(mfaSecret ? { mfaSecret } : {}) });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }

    try {
      const client = new MonarchClient(lc.config.monarchSessionFile);
      await client.authenticate(email, password, mfaSecret);
      recordMonarchConnected(lc.storage);
      return c.json({ ok: true, settings: getMonarchSettings(lc.storage) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      recordMonarchError(lc.storage, message);
      return c.json({ error: message, settings: getMonarchSettings(lc.storage) }, 400);
    }
  });

  app.post("/monarch/sync", async (c) => {
    let client;
    try {
      client = await buildMonarchClientFromProfile({ storage: lc.storage, config: lc.config });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      recordMonarchError(lc.storage, message);
      return c.json({ error: message }, 400);
    }
    if (!client) return c.json({ error: "monarch_not_configured" }, 400);

    try {
      const job = await lc.storage.jobs.run("sync.monarch", async () => {
        const result = await syncMonarch(client, lc.storage, { semantic: lc.memory.semantic });
        recordMonarchSync(lc.storage);
        // Financial insights are now produced by the unified Insighter on its
        // own daily cron (07:30) — we no longer kick them off from sync.
        return result;
      });
      if (job.status === "skipped") return c.json({ skipped: true });
      return c.json({ result: job.result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      recordMonarchError(lc.storage, message);
      return c.json({ error: message }, 500);
    }
  });

  return app;
};
