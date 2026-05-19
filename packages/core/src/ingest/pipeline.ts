import fs from "node:fs/promises";
import path from "node:path";
import type { Document } from "@lifecoach/schemas";
import type { Storage } from "../storage/index.js";
import type { Embedder } from "../embeddings/index.js";
import type { Memory } from "../memory/index.js";
import { LifecoachError } from "../util/errors.js";
import { sha256File } from "../util/hash.js";
import { parseMarkdown, type ParsedDocument } from "./parsers/markdown.js";
import { parseCsv } from "./parsers/csv.js";
import { parsePdf } from "./parsers/pdf.js";
import { chunkText, type Chunk } from "./chunker.js";
import type { Extractor, ExtractionResult } from "./extractor.js";

export interface IngestPipelineDeps {
  storage: Storage;
  embedder: Embedder;
  memory: Memory;
  /** Optional. When present, ingestion runs LLM-assisted fact + measurement extraction. */
  extractor?: Extractor;
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
  /** Run LLM-assisted fact/measurement extraction (default true if extractor is configured). */
  extract?: boolean;
  /** Skip dedup check on file hash. Default false. */
  force?: boolean;
  /** Optional progress callback for UI feedback. */
  onProgress?: (event: IngestProgressEvent) => void;
}

export type IngestProgressEvent =
  | { phase: "parse"; path: string }
  | { phase: "chunk"; count: number }
  | { phase: "embed"; batch: number; totalBatches: number }
  | { phase: "persist"; documentId: string }
  | { phase: "extract" }
  | { phase: "extract-result"; factsExtracted: number; measurementsExtracted: number; notes?: string }
  | { phase: "skipped"; documentId: string; reason: "duplicate" }
  | { phase: "done"; documentId: string; chunkCount: number };

export interface IngestResult {
  document: Document;
  chunkCount: number;
  embedded: boolean;
  factsExtracted: number;
  measurementsExtracted: number;
  /** True when an identical-hash file had already been ingested and we returned the existing document. */
  skipped: boolean;
  extractionError?: string;
  extractionNotes?: string;
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

    // Dedup: hash the file and look it up. If we've seen this exact content
    // before, return the existing document without re-processing.
    if (!opts.force) {
      const hash = await sha256File(absPath);
      const existing = storage.ingestedFiles.getByHash(hash);
      if (existing) {
        const doc = storage.documents.get(existing.documentId);
        if (doc) {
          opts.onProgress?.({ phase: "skipped", documentId: doc.id, reason: "duplicate" });
          return {
            document: doc,
            chunkCount: 0,
            embedded: false,
            factsExtracted: 0,
            measurementsExtracted: 0,
            skipped: true,
          };
        }
      }
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

    let factsExtracted = 0;
    let measurementsExtracted = 0;
    let extractionError: string | undefined;
    let extractionNotes: string | undefined;

    const shouldExtract = (opts.extract ?? true) && this.deps.extractor != null && body.length > 0;
    if (shouldExtract && this.deps.extractor) {
      opts.onProgress?.({ phase: "extract" });
      try {
        const result = await this.deps.extractor.extract(body, {
          identityProfile: this.deps.memory.identity.render(),
          ...(parsed.title ? { documentTitle: parsed.title } : {}),
          documentSource: opts.source ?? "file-drop",
        });
        const persisted = await this.persistExtraction(document.id, result);
        factsExtracted = persisted.factsExtracted;
        measurementsExtracted = persisted.measurementsExtracted;
        if (result.notes) extractionNotes = result.notes;
        opts.onProgress?.({
          phase: "extract-result",
          factsExtracted,
          measurementsExtracted,
          ...(extractionNotes ? { notes: extractionNotes } : {}),
        });
      } catch (err) {
        // Extraction failure is non-fatal — the document + chunks are already
        // persisted and searchable. Surface the error for the caller.
        extractionError = err instanceof Error ? err.message : String(err);
      }
    }

    // Record the file hash so future ingests of the same content are skipped.
    // Computed late so parse failures don't poison the dedup table.
    try {
      const hash = await sha256File(absPath);
      storage.ingestedFiles.record({
        hash,
        path: absPath,
        documentId: document.id,
        sizeBytes: stat.size,
      });
    } catch {
      // Non-fatal — the document is persisted regardless.
    }

    opts.onProgress?.({ phase: "done", documentId: document.id, chunkCount: chunks.length });
    return {
      document,
      chunkCount: chunks.length,
      embedded,
      factsExtracted,
      measurementsExtracted,
      skipped: false,
      ...(extractionError ? { extractionError } : {}),
      ...(extractionNotes ? { extractionNotes } : {}),
    };
  }

  private async persistExtraction(
    documentId: string,
    extraction: ExtractionResult,
  ): Promise<{ factsExtracted: number; measurementsExtracted: number }> {
    const { storage, memory } = this.deps;
    let factsExtracted = 0;
    let measurementsExtracted = 0;

    // Facts go through SemanticMemory.remember so they get auto-embedded into
    // the same recall surface as user-stated facts.
    for (const fact of extraction.facts) {
      await memory.semantic.remember({
        ...fact,
        source: `document:${documentId}`,
        data: { ...(fact.data ?? {}), sourceDocumentId: documentId },
      });
      factsExtracted += 1;
    }

    // Measurements go directly to the repository — they're not embedded.
    for (const measurement of extraction.measurements) {
      storage.measurements.create({
        ...measurement,
        sourceDocumentId: documentId,
      });
      measurementsExtracted += 1;
    }

    return { factsExtracted, measurementsExtracted };
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
