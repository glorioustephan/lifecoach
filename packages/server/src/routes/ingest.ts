import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Hono } from "hono";
import type { Lifecoach } from "@lifecoach/core";
import { IngestPipeline } from "@lifecoach/core";

export const ingestRoutes = (lc: Lifecoach) => {
  const app = new Hono();

  app.get("/recent", (c) => {
    const stmt = lc.storage.handle.db.prepare(
      "SELECT hash, path, document_id, size_bytes, ingested_at FROM ingested_files ORDER BY ingested_at DESC LIMIT 50",
    );
    return c.json({ files: stmt.all() });
  });

  // Upload-and-ingest. Accepts multipart form data with a 'file' field.
  // Writes to the watched raw dir so the watcher (if running) sees it too.
  app.post("/", async (c) => {
    const form = await c.req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return c.json({ error: "no_file" }, 400);
    }
    const extract = form.get("extract") !== "false";

    await fs.mkdir(lc.config.rawDir, { recursive: true });
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const targetPath = path.join(lc.config.rawDir, safeName);
    const tmpPath = path.join(os.tmpdir(), `lifecoach-${Date.now()}-${safeName}`);

    // Write to tmp first, then atomically rename — avoids the watcher seeing
    // a partial write.
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(tmpPath, buffer);
    await fs.rename(tmpPath, targetPath);

    try {
      const pipeline = new IngestPipeline({
        storage: lc.storage,
        embedder: lc.embedder,
        memory: lc.memory,
        ...(lc.extractor ? { extractor: lc.extractor } : {}),
      });
      const result = await pipeline.ingest(targetPath, { extract });
      return c.json({ result });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  return app;
};
