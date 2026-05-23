import { Hono } from "hono";
import { getArtifactSettings, type Lifecoach } from "@lifecoach/core";

export const statusRoutes = (lc: Lifecoach) => {
  const app = new Hono();

  app.get("/", (c) => {
    const recent = lc.memory.episodic.recentSessions(1)[0];
    const artifactSettings = getArtifactSettings(lc.storage);
    return c.json({
      model: lc.config.model,
      embedder: { enabled: lc.embedder.enabled, dim: lc.config.embeddingDim },
      todoist: lc.todoist != null,
      capacities: lc.capacities != null,
      artifactsAutoExtract: artifactSettings.enabled,
      counts: {
        profileEntries: lc.memory.identity.entries().length,
        facts: lc.storage.facts.count(),
        documents: lc.storage.documents.count(),
        measurements: lc.storage.measurements.count(),
        embeddings: lc.storage.embeddings.count(),
        reflections: lc.storage.reflections.count(),
        insights: lc.storage.insights.count(),
        sessions: lc.storage.sessions.count(),
        messages: lc.storage.messages.count(),
        activeTasks: lc.storage.tasks.list({ status: "active", limit: 1_000_000 }).length,
        artifacts: lc.storage.artifacts.count(),
      },
      lastSession: recent
        ? { id: recent.id, startedAt: recent.startedAt }
        : null,
    });
  });

  return app;
};
