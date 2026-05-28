import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import JSZip from "jszip";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import type { Lifecoach } from "@lifecoach/core";
import { IngestPipeline } from "@lifecoach/core";

const isMarkdown = (name: string): boolean => /\.(md|markdown)$/i.test(name);
const safeName = (name: string): string =>
  path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");

export const ingestRoutes = (lc: Lifecoach) => {
  const app = new Hono();

  app.get("/recent", (c) => {
    // Project to the snake_case wire shape the prior raw SQL emitted so
    // the existing web client doesn't break — kept verbatim.
    const files = lc.storage.ingestedFiles.recent(50).map((f) => ({
      hash: f.hash,
      path: f.path,
      document_id: f.documentId,
      size_bytes: f.sizeBytes,
      ingested_at: f.ingestedAt,
    }));
    return c.json({ files });
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
    const fileEntries = form.getAll("files").filter((f) => typeof f !== "string");
    if (fileEntries.length === 0) return c.json({ error: "no_files" }, 400);
    const extract = form.get("extract") === "true";

    await fs.mkdir(lc.config.rawDir, { recursive: true });

    // Expand uploads (direct .md files + entries inside .zip archives) into a
    // flat list of markdown items so we know the total up front and can stream
    // per-item progress.
    const items: Array<{ name: string; buffer: Buffer }> = [];
    const preErrors: string[] = [];
    for (const file of fileEntries) {
      if (typeof file === "string") continue; // narrow FormDataEntryValue -> File
      const buf = Buffer.from(await file.arrayBuffer());
      if (/\.zip$/i.test(file.name)) {
        try {
          const zip = await JSZip.loadAsync(buf);
          for (const entry of Object.values(zip.files)) {
            if (entry.dir) continue;
            if (entry.name.includes("__MACOSX") || path.basename(entry.name).startsWith(".")) continue;
            if (!isMarkdown(entry.name)) continue;
            items.push({ name: path.basename(entry.name), buffer: await entry.async("nodebuffer") });
          }
        } catch {
          preErrors.push(`${file.name}: not a valid zip`);
        }
      } else if (isMarkdown(file.name)) {
        items.push({ name: file.name, buffer: buf });
      }
    }

    const pipeline = new IngestPipeline({
      storage: lc.storage,
      embedder: lc.embedder,
      memory: lc.memory,
      ...(lc.extractor ? { extractor: lc.extractor } : {}),
    });

    // Stream newline-delimited JSON progress: the client gets live "done/total"
    // feedback, and the steady output keeps the connection alive through a long
    // import (avoids request timeouts on big exports).
    return stream(c, async (s) => {
      let imported = 0;
      let skipped = 0;
      let failed = 0;
      const errors: string[] = [...preErrors];
      const send = async (obj: unknown): Promise<void> => {
        await s.write(JSON.stringify(obj) + "\n");
      };

      await send({ type: "start", total: items.length });
      for (let i = 0; i < items.length; i += 1) {
        const { name, buffer } = items[i]!;
        const fileName = safeName(name);
        let status: "imported" | "skipped" | "failed" = "imported";
        try {
          const target = path.join(lc.config.rawDir, fileName);
          await fs.writeFile(target, buffer);
          const result = await pipeline.ingest(target, { extract });
          if (result.skipped) {
            skipped += 1;
            status = "skipped";
          } else {
            imported += 1;
          }
        } catch (err) {
          failed += 1;
          status = "failed";
          if (errors.length < 25) {
            errors.push(`${fileName}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        await send({ type: "progress", done: i + 1, total: items.length, name: fileName, status });
      }
      await send({ type: "done", imported, skipped, failed, errors });
    });
  });

  return app;
};
