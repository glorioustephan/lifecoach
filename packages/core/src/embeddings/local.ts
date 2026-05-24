import type { Embedder } from "./embedder.js";
import { NotImplementedError } from "../util/errors.js";

/**
 * Local on-device embedder fallback using @xenova/transformers (BGE-small).
 *
 * Not yet implemented. To wire this up:
 *   1. pnpm add -F @lifecoach/core @xenova/transformers
 *   2. import { pipeline } from '@xenova/transformers' and create a feature-extraction pipeline
 *      with 'Xenova/bge-small-en-v1.5'.
 *   3. Pool the token embeddings (mean pool) and L2-normalize to get a 384-d vector.
 *   4. Make sure LIFECOACH_EMBEDDING_DIM matches the model output dimension.
 */
export class LocalEmbedder implements Embedder {
  readonly enabled = true;
  readonly metadata: Embedder["metadata"];

  constructor(readonly dimension: number) {
    this.metadata = { provider: "local", dimension };
  }

  async embed(_texts: string[]): Promise<number[][]> {
    throw new NotImplementedError(
      "LocalEmbedder.embed",
      "see packages/core/src/embeddings/local.ts for wiring instructions",
    );
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return this.embed(texts);
  }

  async embedQuery(text: string): Promise<number[]> {
    const [vec] = await this.embed([text]);
    return vec ?? [];
  }
}
