export interface EmbeddingProviderMetadata {
  provider: "none" | "voyage" | "local";
  model?: string;
  rerankModel?: string;
  dimension: number;
}

export interface RerankDocument {
  id: string;
  text: string;
}

export interface RerankResult {
  id: string;
  index: number;
  score: number;
}

export interface Embedder {
  readonly dimension: number;
  readonly metadata: EmbeddingProviderMetadata;
  /**
   * Returns true when embedding requests will actually produce vectors.
   * When false, callers should skip embedding (and recall() degrades to keyword search).
   */
  readonly enabled: boolean;
  /** Backwards-compatible document embedding entrypoint. */
  embed(texts: string[]): Promise<number[][]>;
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
  rerank?(
    query: string,
    documents: RerankDocument[],
    opts?: { topK?: number },
  ): Promise<RerankResult[]>;
}

export class NullEmbedder implements Embedder {
  readonly enabled = false;
  readonly metadata: EmbeddingProviderMetadata;

  constructor(readonly dimension: number) {
    this.metadata = { provider: "none", dimension };
  }

  async embed(_texts: string[]): Promise<number[][]> {
    return [];
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return this.embed(texts);
  }

  async embedQuery(_text: string): Promise<number[]> {
    return [];
  }
}
