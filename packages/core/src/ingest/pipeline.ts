import fs from "node:fs/promises";
import path from "node:path";
import type { Document } from "@lifecoach/schemas";
import type { Storage } from "../storage/index.js";
import type { Embedder } from "../embeddings/index.js";
import { LifecoachError } from "../util/errors.js";
import { parseMarkdown, type ParsedDocument } from "./parsers/markdown.js";
import { parseCsv } from "./parsers/csv.js";
import { parsePdf } from "./parsers/pdf.js";
import { chunkText, type Chunk } from "./chunker.js";

export interface IngestPipelineDeps {
  storage: Storage;
  embedder: Embedder;
}

export type IngestType = "pdf" | "csv" | "markdown" | "auto";

export interface IngestOptions {
  type?: IngestType;
  /** Source label stored on the document row. Default: 'file-drop'. */
  source?: string;
  /** Chunk size override (chars). */
  chunkSize?: number;
  /** Chunk overlap override (chars). */
  chunkOverlap?: number;
  /** Voyage embed batch size. Default 64. */
  batchSize?: number;
  /** Optional progress callback for UI feedback. */
  onProgress?: (event: IngestProgressEvent) => void;
}

export type IngestProgressEvent =
  | { phase: "parse"; path: string }
  | { phase: "chunk"; count: number }
  | { phase: "embed"; batch: number; totalBatches: number }
  | { phase: "persist"; documentId: string }
  | { phase: "done"; documentId: string; chunkCount: number };

export interface IngestResult {
  document: Document;
  chunkCount: number;
  embedded: boolean;
}

const MAX_BODY_CHARS = 2_000_000; // ~2 MB of text, ~250 pages of typical prose

const detectType = (p: string): IngestType => {
  const ext = path.extname(p).toLowerCase();
  if (ext === ".pdf") return "pdf";
  if (ext === ".csv") return "csv";
  if (ext === ".md" || ext === ".markdown") return "markdown";
  return "auto";
};

const parse = async (filePath: string, type: IngestType): Promise<ParsedDocument> => {
  const resolved = type === "auto" ? detectType(filePath) : type;
  switch (resolved) {
    case "markdown":
      return parseMarkdown(filePath);
    case "csv":
      return parseCsv(filePath);
    case "pdf":
      return parsePdf(filePath);
    default:
      throw new LifecoachError(
        `Unsupported file type for ${filePath}. Use .md, .csv, or .pdf, or pass an explicit type.`,
        "UNSUPPORTED_INGEST_TYPE",
      );
  }
};

const mimeFor = (filePath: string, parsed: ParsedDocument): string | undefined => {
  if (parsed.metadata && typeof parsed.metadata["mime"] === "string") {
    return parsed.metadata["mime"];
  }
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".md" || ext === ".markdown") return "text/markdown";
  if (ext === ".csv") return "text/csv";
  if (ext === ".pdf") return "application/pdf";
  return undefined;
};

export class IngestPipeline {
  constructor(private readonly deps: IngestPipelineDeps) {}

  async ingest(filePath: string, opts: IngestOptions = {}): Promise<IngestResult> {
    const { storage, embedder } = this.deps;
    const absPath = path.resolve(filePath);
    const stat = await fs.stat(absPath);
    if (!stat.isFile()) {
      throw new LifecoachError(`Not a file: ${absPath}`, "INGEST_NOT_A_FILE");
    }

    opts.onProgress?.({ phase: "parse", path: absPath });
    const parsed = await parse(absPath, opts.type ?? "auto");
    let body = parsed.body ?? "";
    if (body.length > MAX_BODY_CHARS) {
      body =
        body.slice(0, MAX_BODY_CHARS) +
        `\n\n[truncated: original was ${body.length} chars, kept first ${MAX_BODY_CHARS}]`;
    }

    const mime = mimeFor(absPath, parsed);
    const document = storage.documents.create({
      source: opts.source ?? "file-drop",
      ...(mime ? { mime } : {}),
      ...(parsed.title ? { title: parsed.title } : {}),
      body,
      metadata: {
        ...(parsed.metadata ?? {}),
        sourcePath: absPath,
      },
    });
    opts.onProgress?.({ phase: "persist", documentId: document.id });

    const chunks = body
      ? chunkText(body, {
          ...(opts.chunkSize !== undefined ? { size: opts.chunkSize } : {}),
          ...(opts.chunkOverlap !== undefined ? { overlap: opts.chunkOverlap } : {}),
        })
      : [];
    opts.onProgress?.({ phase: "chunk", count: chunks.length });

    let embedded = false;
    if (embedder.enabled && chunks.length > 0) {
      embedded = true;
      const batchSize = opts.batchSize ?? 64;
      const totalBatches = Math.ceil(chunks.length / batchSize);
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        opts.onProgress?.({
          phase: "embed",
          batch: Math.floor(i / batchSize) + 1,
          totalBatches,
        });
        const vectors = await embedder.embed(batch.map((c) => c.text));
        this.persistBatch(document.id, batch, vectors);
      }
    }

    opts.onProgress?.({ phase: "done", documentId: document.id, chunkCount: chunks.length });
    return { document, chunkCount: chunks.length, embedded };
  }

  private persistBatch(documentId: string, chunks: Chunk[], vectors: number[][]): void {
    const { storage } = this.deps;
    // better-sqlite3 transactions are sync — wrap the inserts.
    const tx = storage.handle.db.transaction(() => {
      for (let i = 0; i < chunks.length; i += 1) {
        const chunk = chunks[i];
        const vec = vectors[i];
        if (!chunk || !vec || vec.length === 0) continue;
        storage.embeddings.insert({
          refType: "document",
          refId: documentId,
          chunkIndex: chunk.index,
          text: chunk.text,
          embedding: vec,
        });
      }
    });
    tx();
  }
}
