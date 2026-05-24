import { afterEach, describe, expect, it } from "vitest";
import type {
  Embedder,
  EmbeddingProviderMetadata,
  RerankDocument,
  RerankResult,
} from "../embeddings/index.js";
import { SemanticMemory } from "./semantic.js";
import { createTestStorage, type TestStorageHandle } from "../testing/test-storage.js";

class FakeRerankEmbedder implements Embedder {
  readonly enabled = true;
  readonly dimension = 2;
  readonly metadata: EmbeddingProviderMetadata = {
    provider: "local",
    model: "fake",
    rerankModel: "fake-rerank",
    dimension: 2,
  };

  async embed(texts: string[]): Promise<number[][]> {
    return this.embedDocuments(texts);
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return texts.map(() => [1, 0]);
  }

  async embedQuery(_text: string): Promise<number[]> {
    return [1, 0];
  }

  async rerank(
    _query: string,
    documents: RerankDocument[],
    opts: { topK?: number } = {},
  ): Promise<RerankResult[]> {
    return documents
      .map((doc, index) => ({
        id: doc.id,
        index,
        score: doc.text.includes("rerank winner") ? 0.99 : 0.1,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.topK ?? documents.length);
  }
}

let handle: TestStorageHandle | null = null;

afterEach(() => {
  handle?.cleanup();
  handle = null;
});

describe("SemanticMemory retrieval", () => {
  it("reranks sqlite-vec candidates through the provider", async () => {
    handle = createTestStorage();
    const { storage } = handle;
    storage.embeddings.insert({
      refType: "document",
      refId: "doc-near",
      chunkIndex: 0,
      text: "near vector but less relevant",
      embedding: [1, 0],
      model: "fake",
      dimension: 2,
    });
    storage.embeddings.insert({
      refType: "document",
      refId: "doc-winner",
      chunkIndex: 0,
      text: "rerank winner despite vector tie",
      embedding: [1, 0],
      model: "fake",
      dimension: 2,
    });

    const memory = new SemanticMemory({
      storage,
      embedder: new FakeRerankEmbedder(),
    });
    const hits = await memory.recall("important", { scope: "documents", limit: 1 });

    expect(hits).toHaveLength(1);
    expect(hits[0]?.refId).toBe("doc-winner");
    expect(hits[0]?.score).toBe(0.99);
  });

  it("does not starve rare task scope and excludes completed tasks", () => {
    handle = createTestStorage();
    const { storage } = handle;
    for (let i = 0; i < 60; i += 1) {
      storage.embeddings.insert({
        refType: "document",
        refId: `doc-${i}`,
        chunkIndex: 0,
        text: `near document ${i}`,
        embedding: [1, 0],
      });
    }
    const task = storage.tasks.upsertByExternal({
      externalId: "t-1",
      externalSource: "test",
      content: "renew passport",
      labels: [],
    });
    storage.embeddings.insert({
      refType: "task",
      refId: task.id,
      chunkIndex: 0,
      text: "[task] renew passport",
      embedding: [0, 1],
    });

    const beforeComplete = storage.embeddings.search([1, 0], {
      refType: "task",
      limit: 1,
      maxCandidates: 100,
    });
    expect(beforeComplete.map((hit) => hit.refId)).toEqual([task.id]);

    storage.tasks.completeTask(task.id);
    const afterComplete = storage.embeddings.search([1, 0], {
      refType: "task",
      limit: 1,
      maxCandidates: 100,
    });
    expect(afterComplete).toEqual([]);
  });

  it("excludes expired facts from semantic recall", async () => {
    handle = createTestStorage();
    const { storage } = handle;
    const memory = new SemanticMemory({
      storage,
      embedder: new FakeRerankEmbedder(),
    });
    const fact = await memory.remember({
      category: "health",
      subject: "sleep",
      body: "Bedtime has been steady.",
      confidence: 1,
    });

    expect(await memory.recall("bedtime", { scope: "facts", limit: 1 })).toHaveLength(1);

    memory.forget(fact.id);
    expect(await memory.recall("bedtime", { scope: "facts", limit: 1 })).toEqual([]);
  });
});
