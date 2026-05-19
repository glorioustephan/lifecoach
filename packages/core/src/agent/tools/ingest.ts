import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { Storage } from "../../storage/index.js";
import type { Embedder } from "../../embeddings/index.js";
import type { Memory } from "../../memory/index.js";
import { IngestPipeline, type Extractor } from "../../ingest/index.js";

export interface IngestToolDeps {
  storage: Storage;
  embedder: Embedder;
  memory: Memory;
  extractor: Extractor | null;
}

export const buildIngestTools = (deps: IngestToolDeps) => [
  tool(
    "ingest_document",
    "Pipe a file (Markdown, CSV, PDF) through the ingest pipeline. Parses, chunks, embeds, and (when the extractor is available) pulls out structured facts and measurements. Use this when the user mentions a file path or asks you to read a document.",
    {
      path: z.string().min(1).describe("Absolute path, or a path under data/raw"),
      type: z
        .enum(["pdf", "csv", "markdown", "auto"])
        .optional()
        .describe("Default: auto-detect by extension"),
      extract: z
        .boolean()
        .optional()
        .describe("Default true — set false to skip LLM extraction and only chunk+embed."),
    },
    async ({ path, type, extract }) => {
      const pipeline = new IngestPipeline({
        storage: deps.storage,
        embedder: deps.embedder,
        memory: deps.memory,
        ...(deps.extractor ? { extractor: deps.extractor } : {}),
      });
      const result = await pipeline.ingest(path, {
        ...(type ? { type } : {}),
        ...(extract !== undefined ? { extract } : {}),
      });
      const lines = [
        `Ingested document ${result.document.id}`,
        `  title: ${result.document.title ?? "(none)"}`,
        `  mime: ${result.document.mime ?? "(unknown)"}`,
        `  body chars: ${result.document.body.length}`,
        `  chunks: ${result.chunkCount}`,
        `  embedded: ${result.embedded ? "yes" : "no (embedder disabled)"}`,
        `  facts extracted: ${result.factsExtracted}`,
        `  measurements extracted: ${result.measurementsExtracted}`,
      ];
      if (result.extractionNotes) lines.push(`  notes: ${result.extractionNotes}`);
      if (result.extractionError) lines.push(`  extraction error: ${result.extractionError}`);
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  ),
];
