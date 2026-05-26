import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import JSZip from "jszip";
import { Hono } from "hono";
import type { Lifecoach } from "@lifecoach/core";
import { IngestPipeline } from "@lifecoach/core";

const isMarkdown = (name: string): boolean => /\.(md|markdown)$/i.test(name);
const safeName = (name: string): string =>
  path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");

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

  // Bulk import. Accepts multipart 'files' (one or many) — each a .zip of
  // markdown OR a direct .md/.markdown file (a folder upload sends many files).
  // Markdown entries are written to the raw dir and run through the ingest
  // pipeline (dedup by content hash). LLM fact-extraction is OFF by default to
  // keep a big import cheap and fast; embeddings still happen.
  app.post("/import", async (c) => {
    const form = await c.req.formData();
    const files = form.getAll("files").filter((f) => typeof f !== "string");
    if (files.length === 0) return c.json({ error: "no_files" }, 400);
    const extract = form.get("extract") === "true";

    await fs.mkdir(lc.config.rawDir, { recursive: true });
    const pipeline = new IngestPipeline({
      storage: lc.storage,
      embedder: lc.embedder,
      memory: lc.memory,
      ...(lc.extractor ? { extractor: lc.extractor } : {}),
    });

    let imported = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];

    const ingestBuffer = async (name: string, buffer: Buffer): Promise<void> => {
      if (!isMarkdown(name)) return; // markdown only
      const target = path.join(lc.config.rawDir, safeName(name));
      try {
        await fs.writeFile(target, buffer);
        const result = await pipeline.ingest(target, { extract });
        if (result.skipped) skipped += 1;
        else imported += 1;
      } catch (err) {
        failed += 1;
        if (errors.length < 25) {
          errors.push(`${safeName(name)}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    };

    for (const file of files) {
      if (typeof file === "string") continue; // narrow FormDataEntryValue -> File
      const buf = Buffer.from(await file.arrayBuffer());
      if (/\.zip$/i.test(file.name)) {
        let zip: JSZip;
        try {
          zip = await JSZip.loadAsync(buf);
        } catch (err) {
          failed += 1;
          errors.push(`${file.name}: not a valid zip`);
          continue;
        }
        for (const entry of Object.values(zip.files)) {
          if (entry.dir) continue;
          if (entry.name.includes("__MACOSX") || path.basename(entry.name).startsWith(".")) continue;
          if (!isMarkdown(entry.name)) continue;
          const content = await entry.async("nodebuffer");
          await ingestBuffer(entry.name, content);
        }
      } else {
        await ingestBuffer(file.name, buf);
      }
    }

    return c.json({ imported, skipped, failed, errors });
  });

  return app;
};
