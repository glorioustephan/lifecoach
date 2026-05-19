import type { LifecoachConfig } from "../config/index.js";
import type { Embedder } from "./embedder.js";
import { NullEmbedder } from "./embedder.js";
import { VoyageEmbedder } from "./voyage.js";

export { type Embedder, NullEmbedder } from "./embedder.js";
export { VoyageEmbedder } from "./voyage.js";
export { LocalEmbedder } from "./local.js";

/**
 * Pick an embedder based on what's configured.
 * Order: Voyage (if VOYAGE_API_KEY) → NullEmbedder (recall falls back to keyword).
 */
export const createEmbedder = (config: LifecoachConfig): Embedder => {
  if (config.voyageApiKey) {
    return new VoyageEmbedder({
      apiKey: config.voyageApiKey,
      dimension: config.embeddingDim,
    });
  }
  return new NullEmbedder(config.embeddingDim);
};
