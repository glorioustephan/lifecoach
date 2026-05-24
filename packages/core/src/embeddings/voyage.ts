import { VoyageAIClient } from "voyageai";
import type {
  Embedder,
  EmbeddingProviderMetadata,
  RerankDocument,
  RerankResult,
} from "./embedder.js";
import { withRetry } from "../util/retry.js";
import { LruCache } from "../util/lru.js";

export interface VoyageEmbedderOptions {
  apiKey: string;
  model?: string;
  dimension?: number;
  inputType?: "query" | "document";
  rerankModel?: string;
  /** LRU capacity for query-embedding cache. Default: 256. Set to 0 to disable. */
  queryCacheSize?: number;
  /** Retry config — exposed for tests. */
  maxRetries?: number;
}

const DEFAULT_MODEL = "voyage-3";
const DEFAULT_RERANK_MODEL = "rerank-2.5-lite";
const DEFAULT_DIM = 1024;
const DEFAULT_QUERY_CACHE = 256;

export class VoyageEmbedder implements Embedder {
  readonly enabled = true;
  readonly dimension: number;
  readonly metadata: EmbeddingProviderMetadata;
  private readonly client: VoyageAIClient;
  private readonly model: string;
  private readonly inputType: "query" | "document";
  private readonly rerankModel: string;
  private readonly queryCache: LruCache<string, number[]> | null;
  private readonly maxRetries: number;

  constructor(opts: VoyageEmbedderOptions) {
    this.client = new VoyageAIClient({ apiKey: opts.apiKey });
    this.model = opts.model ?? DEFAULT_MODEL;
    this.dimension = opts.dimension ?? DEFAULT_DIM;
    this.inputType = opts.inputType ?? "document";
    this.rerankModel = opts.rerankModel ?? DEFAULT_RERANK_MODEL;
    this.metadata = {
      provider: "voyage",
      model: this.model,
      rerankModel: this.rerankModel,
      dimension: this.dimension,
    };
    const cacheSize = opts.queryCacheSize ?? DEFAULT_QUERY_CACHE;
    this.queryCache = cacheSize > 0 ? new LruCache<string, number[]>(cacheSize) : null;
    this.maxRetries = opts.maxRetries ?? 5;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return this.embedDocuments(texts);
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return this.embedWithInputType(texts, this.inputType, "embed");
  }

  private async embedWithInputType(
    texts: string[],
    inputType: "query" | "document",
    label: string,
  ): Promise<number[][]> {
    if (texts.length === 0) return [];
    const resp = await withRetry(
      () =>
        this.client.embed({
          input: texts,
          model: this.model,
          inputType,
        }),
      { maxAttempts: this.maxRetries, onRetry: this.warnRetry.bind(this, label) },
    );
    const data = resp.data ?? [];
    return data
      .map((row) => (row?.embedding ?? []) as number[])
      .filter((vec) => vec.length > 0);
  }

  /** Convenience for query-time embedding (uses query input type + LRU cache). */
  async embedQuery(text: string): Promise<number[]> {
    if (this.queryCache) {
      const hit = this.queryCache.get(text);
      if (hit) return hit;
    }
    const [vec = []] = await this.embedWithInputType([text], "query", "embedQuery");
    if (this.queryCache && vec.length > 0) {
      this.queryCache.set(text, vec);
    }
    return vec;
  }

  async rerank(
    query: string,
    documents: RerankDocument[],
    opts: { topK?: number } = {},
  ): Promise<RerankResult[]> {
    if (documents.length === 0) return [];
    const capped = documents.slice(0, 1000);
    const resp = await withRetry(
      () =>
        this.client.rerank({
          query,
          documents: capped.map((doc) => doc.text),
          model: this.rerankModel,
          topK: opts.topK ?? capped.length,
          returnDocuments: false,
          truncation: true,
        }),
      { maxAttempts: this.maxRetries, onRetry: this.warnRetry.bind(this, "rerank") },
    );
    return (resp.data ?? [])
      .map((item) => {
        const index = item.index ?? -1;
        const doc = capped[index];
        if (!doc) return null;
        return {
          id: doc.id,
          index,
          score: item.relevanceScore ?? 0,
        };
      })
      .filter((result): result is RerankResult => result !== null);
  }

  private warnRetry(label: string, attempt: number, delayMs: number, err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err);
    // Single-line stderr so it doesn't muddy the chat output.
    console.error(`[voyage:${label}] retry ${attempt} in ${delayMs}ms (${msg})`);
  }
}
