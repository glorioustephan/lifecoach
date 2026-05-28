import { Hono } from "hono";
import { z } from "zod";
import { detectArtifactTypes, getArtifactDescriptor } from "@lifecoach/schemas";
import {
  scanArtifacts,
  scanDocumentArtifacts,
  getArtifactSettings,
  setAutoExtractEnabled,
  MIN_CRON_CONFIDENCE,
  type Lifecoach,
} from "@lifecoach/core";
import { parseOffsetPagination } from "../lib/query.js";

const extractSchema = z.object({
  content: z.string().min(1),
  sessionId: z.string().optional(),
  type: z.string().optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  category: z.string().nullable().optional(),
});

const settingsSchema = z.object({
  autoExtractEnabled: z.boolean(),
});

export const artifactRoutes = (lc: Lifecoach) => {
  const app = new Hono();

  // List with type filter + text search + pagination.
  app.get("/", (c) => {
    const type = c.req.query("type") || undefined;
    const q = c.req.query("q") || undefined;
    const { limit, offset } = parseOffsetPagination((key) => c.req.query(key), {
      defaultLimit: 20,
      maxLimit: 100,
    });
    const { items, total } = lc.storage.artifacts.list({
      ...(type ? { type } : {}),
      ...(q ? { q } : {}),
      limit,
      offset,
    });
    return c.json({ items, total, limit, offset });
  });

  // Cron-enable settings (must precede /:id routes).
  app.get("/settings", (c) => {
    const s = getArtifactSettings(lc.storage);
    return c.json({ settings: s });
  });

  app.patch("/settings", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = settingsSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
    setAutoExtractEnabled(lc.storage, parsed.data.autoExtractEnabled);
    return c.json({ settings: getArtifactSettings(lc.storage) });
  });

  // Conversation-time save: extract + format one message, persist immediately.
  app.post("/extract", async (c) => {
    if (!lc.artifactExtractor) return c.json({ error: "anthropic_not_configured" }, 400);
    const body = await c.req.json().catch(() => null);
    const parsed = extractSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
    }
    const { content, sessionId } = parsed.data;
    const types = parsed.data.type
      ? [parsed.data.type]
      : detectArtifactTypes(content);
    if (types.length === 0) return c.json({ error: "no_artifact_detected" }, 422);

    try {
      const extracted = await lc.artifactExtractor.extractFromText(content, { types });
      if (extracted.length === 0) return c.json({ error: "no_artifact_detected" }, 422);
      // Persist the most confident item (the user pressed one button on one reply).
      const best = extracted.reduce((a, b) => (b.confidence > a.confidence ? b : a));
      const artifact = lc.storage.artifacts.create({
        type: best.type,
        title: best.formatted.title,
        body: best.formatted.body,
        category: best.formatted.category ?? null,
        tags: best.formatted.tags,
        confidence: best.confidence,
        origin: "conversation",
        sourceSessionId: sessionId ?? null,
        sourceMessageIds: [],
      });
      return c.json({ artifact });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // On-demand "Generate now" — same path as the cron, but ignores the toggle.
  app.post("/generate", async (c) => {
    if (!lc.artifactExtractor) return c.json({ error: "anthropic_not_configured" }, 400);
    try {
      const deps = { storage: lc.storage, extractor: lc.artifactExtractor };
      const result = await scanArtifacts(deps, {
        minConfidence: MIN_CRON_CONFIDENCE,
        origin: "cron",
      });
      // "Generate now" is an explicit ask to populate — sweep the whole document
      // corpus (sinceMs: 0, high limit), not just recent imports, so existing
      // recipes surface. Already-scanned docs are skipped before any model call.
      const docResult = await scanDocumentArtifacts(deps, {
        sinceMs: 0,
        sessionLimit: 100_000,
        minConfidence: MIN_CRON_CONFIDENCE,
        origin: "cron",
      });
      return c.json({
        created: [...result.created, ...docResult.created],
        candidateSessions: result.candidateSessions,
        candidateDocuments: docResult.candidateDocuments,
        documentsScanned: docResult.documentsScanned,
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => null);
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
    const updated = lc.storage.artifacts.update(id, parsed.data);
    if (!updated) return c.json({ error: "not_found" }, 404);
    return c.json({ artifact: updated });
  });

  app.delete("/:id", (c) => {
    const id = c.req.param("id");
    const existing = lc.storage.artifacts.get(id);
    if (!existing) return c.json({ error: "not_found" }, 404);
    lc.storage.artifacts.delete(id);
    return c.json({ ok: true });
  });

  // Append the artifact's Markdown to today's Capacities daily note.
  app.post("/:id/capacities", async (c) => {
    const id = c.req.param("id");
    const artifact = lc.storage.artifacts.get(id);
    if (!artifact) return c.json({ error: "not_found" }, 404);
    if (!lc.capacities) return c.json({ error: "capacities_not_configured" }, 400);
    const spaceId = lc.config.capacitiesDefaultSpaceId;
    if (!spaceId) return c.json({ error: "capacities_no_default_space" }, 400);
    const label = getArtifactDescriptor(artifact.type)?.label ?? artifact.type;
    try {
      await lc.capacities.saveToDailyNote({
        spaceId,
        mdText: `## ${label}: ${artifact.title}\n\n${artifact.body}`,
        origin: "mcp",
      });
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 502);
    }
  });

  return app;
};
