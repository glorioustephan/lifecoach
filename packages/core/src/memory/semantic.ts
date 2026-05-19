import type {
  Fact,
  NewFact,
  RecallHit,
  RecallScope,
} from "@lifecoach/schemas";
import type { Storage, RefType } from "../storage/index.js";
import type { Embedder } from "../embeddings/index.js";
import type { VoyageEmbedder } from "../embeddings/voyage.js";

export interface SemanticMemoryDeps {
  storage: Storage;
  embedder: Embedder;
}

/**
 * Reads/writes "facts" and (later) documents. Performs auto-embedding when the
 * embedder is enabled; otherwise indexes only metadata and falls back to
 * keyword search on recall.
 */
export class SemanticMemory {
  private readonly storage: Storage;
  private readonly embedder: Embedder;

  constructor(deps: SemanticMemoryDeps) {
    this.storage = deps.storage;
    this.embedder = deps.embedder;
  }

  async remember(fact: NewFact): Promise<Fact> {
    const created = this.storage.facts.create(fact);
    await this.indexFact(created);
    return created;
  }

  forget(id: string): void {
    this.storage.facts.softDelete(id);
    this.storage.embeddings.deleteForRef("fact", id);
  }

  getFact(id: string): Fact | undefined {
    return this.storage.facts.get(id);
  }

  async recall(
    query: string,
    opts: { scope?: RecallScope; limit?: number } = {},
  ): Promise<RecallHit[]> {
    const scope = opts.scope ?? "all";
    const limit = opts.limit ?? 8;

    if (!this.embedder.enabled) {
      return this.keywordFallback(query, scope, limit);
    }

    const queryVec = await this.embedQuery(query);
    const refType = this.scopeToRefType(scope);
    return this.storage.embeddings.search(queryVec, {
      limit,
      ...(refType ? { refType } : {}),
    });
  }

  private async embedQuery(text: string): Promise<number[]> {
    // VoyageEmbedder has a query-flavored helper; fall back to plain embed().
    const maybeVoyage = this.embedder as Partial<VoyageEmbedder>;
    if (typeof maybeVoyage.embedQuery === "function") {
      return maybeVoyage.embedQuery(text);
    }
    const [vec] = await this.embedder.embed([text]);
    return vec ?? [];
  }

  private async indexFact(fact: Fact): Promise<void> {
    if (!this.embedder.enabled) return;
    const text = `[${fact.category}/${fact.subject}] ${fact.body}`;
    const [vec] = await this.embedder.embed([text]);
    if (!vec) return;
    this.storage.embeddings.insert({
      refType: "fact",
      refId: fact.id,
      chunkIndex: 0,
      text,
      embedding: vec,
    });
  }

  private scopeToRefType(scope: RecallScope): RefType | undefined {
    switch (scope) {
      case "facts":
        return "fact";
      case "documents":
        return "document";
      case "messages":
        return "message";
      case "reflections":
        return "reflection";
      case "tasks":
        return "task";
      case "all":
      default:
        return undefined;
    }
  }

  private keywordFallback(
    query: string,
    scope: RecallScope,
    limit: number,
  ): RecallHit[] {
    if (scope !== "facts" && scope !== "all") return [];
    const facts = this.storage.facts.keywordSearch(query, limit);
    return facts.map<RecallHit>((f) => ({
      refType: "fact",
      refId: f.id,
      text: `[${f.category}/${f.subject}] ${f.body}`,
      score: 0.5,
    }));
  }
}
