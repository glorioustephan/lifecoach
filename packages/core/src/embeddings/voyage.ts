import { VoyageAIClient } from "voyageai";
import type { Embedder } from "./embedder.js";
import { withRetry } from "../util/retry.js";
import { LruCache } from "../util/lru.js";

export interface VoyageEmbedderOptions {
  apiKey: string;
  model?: string;
  dimension?: number;
  inputType?: "query" | "document";
  /** LRU capacity for query-embedding cache. Default: 256. Set to 0 to disable. */
  queryCacheSize?: number;
  /** Retry config — exposed for tests. */
  maxRetries?: number;
}

const DEFAULT_MODEL = "voyage-3";
const DEFAULT_DIM = 1024;
const DEFAULT_QUERY_CACHE = 256;

export class VoyageEmbedder implements Embedder {
  readonly enabled = true;
  readonly dimension: number;
  private readonly client: VoyageAIClient;
  private readonly model: string;
  private readonly inputType: "query" | "document";
  private readonly queryCache: LruCache<string, number[]> | null;
  private readonly maxRetries: number;

  constructor(opts: VoyageEmbedderOptions) {
    this.client = new VoyageAIClient({ apiKey: opts.apiKey });
    this.model = opts.model ?? DEFAULT_MODEL;
    this.dimension = opts.dimension ?? DEFAULT_DIM;
    this.inputType = opts.inputType ?? "document";
    const cacheSize = opts.queryCacheSize ?? DEFAULT_QUERY_CACHE;
    this.queryCache = cacheSize > 0 ? new LruCache<string, number[]>(cacheSize) : null;
    this.maxRetries = opts.maxRetries ?? 5;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const resp = await withRetry(
      () =>
        this.client.embed({
          input: texts,
          model: this.model,
          inputType: this.inputType,
        }),
      { maxAttempts: this.maxRetries, onRetry: this.warnRetry.bind(this, "embed") },
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
    const resp = await withRetry(
      () =>
        this.client.embed({
          input: [text],
          model: this.model,
          inputType: "query",
        }),
      { maxAttempts: this.maxRetries, onRetry: this.warnRetry.bind(this, "embedQuery") },
    );
    const vec = (resp.data?.[0]?.embedding ?? []) as number[];
    if (this.queryCache && vec.length > 0) {
      this.queryCache.set(text, vec);
    }
    return vec;
  }

  private warnRetry(label: string, attempt: number, delayMs: number, err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err);
    // Single-line stderr so it doesn't muddy the chat output.
    console.error(`[voyage:${label}] retry ${attempt} in ${delayMs}ms (${msg})`);
  }
}
