export interface Embedder {
  readonly dimension: number;
  /**
   * Returns true when embedding requests will actually produce vectors.
   * When false, callers should skip embedding (and recall() degrades to keyword search).
   */
  readonly enabled: boolean;
  embed(texts: string[]): Promise<number[][]>;
}

export class NullEmbedder implements Embedder {
  readonly enabled = false;
  constructor(readonly dimension: number) {}
  async embed(_texts: string[]): Promise<number[][]> {
    return [];
  }
}
