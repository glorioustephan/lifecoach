import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { Storage } from "../../storage/index.js";
import type { Embedder } from "../../embeddings/index.js";
import { IngestPipeline } from "../../ingest/index.js";

export interface IngestToolDeps {
  storage: Storage;
  embedder: Embedder;
}

export const buildIngestTools = (deps: IngestToolDeps) => [
  tool(
    "ingest_document",
    "Pipe a file (Markdown, CSV, PDF) through the ingest pipeline. Parses, chunks, embeds, and persists so future `recall` calls can find its contents. Use this when the user mentions a file path or asks you to read a document.",
    {
      path: z.string().min(1).describe("Absolute path, or a path under data/raw"),
      type: z
        .enum(["pdf", "csv", "markdown", "auto"])
        .optional()
        .describe("Default: auto-detect by extension"),
    },
    async ({ path, type }) => {
      const pipeline = new IngestPipeline(deps);
      const result = await pipeline.ingest(path, type ? { type } : {});
      const lines = [
        `Ingested document ${result.document.id}`,
        `  title: ${result.document.title ?? "(none)"}`,
        `  mime: ${result.document.mime ?? "(unknown)"}`,
        `  body chars: ${result.document.body.length}`,
        `  chunks: ${result.chunkCount}`,
        `  embedded: ${result.embedded ? "yes" : "no (embedder disabled)"}`,
      ];
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  ),
];
