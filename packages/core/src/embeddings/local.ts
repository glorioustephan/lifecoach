import type { Embedder } from "./embedder.js";

/**
 * Local on-device embedder fallback using @xenova/transformers (BGE-small).
 *
 * Not yet implemented. To wire this up:
 *   1. pnpm add -F @lifecoach/core @xenova/transformers
 *   2. import { pipeline } from '@xenova/transformers' and create a feature-extraction pipeline
 *      with 'Xenova/bge-small-en-v1.5'.
 *   3. Pool the token embeddings (mean pool) and L2-normalize to get a 384-d vector.
 *   4. Make sure LIFECOACH_EMBEDDING_DIM matches the model output dimension.
 *
 * Until those steps are complete, LocalEmbedder has enabled=false so callers
 * degrade to keyword search rather than throwing at runtime.
 */
export class LocalEmbedder implements Embedder {
  /** False until the @xenova/transformers pipeline is wired in. */
  readonly enabled = false;
  readonly metadata: Embedder["metadata"];

  constructor(readonly dimension: number) {
    this.metadata = { provider: "local", dimension };
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
