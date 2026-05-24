import type {
  Fact,
  Message,
  NewFact,
  RecallHit,
  RecallScope,
  Reflection,
} from "@lifecoach/schemas";
import type { Storage, RefType } from "../storage/index.js";
import type { Embedder } from "../embeddings/index.js";

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

    const queryVec = await this.embedder.embedQuery(query);
    const refType = this.scopeToRefType(scope);
    const candidateLimit = this.embedder.rerank ? Math.max(limit * 8, 50) : limit;
    const candidates = this.storage.embeddings.search(queryVec, {
      limit: candidateLimit,
      maxCandidates: Math.max(candidateLimit * 3, 150),
      ...(refType ? { refType } : {}),
    });
    if (!this.embedder.rerank || candidates.length <= limit) {
      return candidates.slice(0, limit);
    }

    const ids = candidates.map(
      (hit, index) => `${hit.refType}:${hit.refId}:${hit.chunkIndex ?? 0}:${index}`,
    );
    const reranked = await this.embedder.rerank(
      query,
      candidates.map((hit, index) => ({ id: ids[index]!, text: hit.text })),
      { topK: limit },
    );
    const byId = new Map(ids.map((id, index) => [id, candidates[index]!]));
    return reranked
      .map((result) => {
        const hit = byId.get(result.id);
        return hit ? { ...hit, score: result.score } : null;
      })
      .filter((hit): hit is RecallHit => hit !== null)
      .slice(0, limit);
  }

  private async indexFact(fact: Fact): Promise<void> {
    const text = `[${fact.category}/${fact.subject}] ${fact.body}`;
    await this.indexRef({
      refType: "fact",
      refId: fact.id,
      text,
      sourceUpdatedAt: fact.validFrom ?? fact.createdAt,
    });
  }

  async indexMessage(message: Message): Promise<void> {
    if (!this.shouldIndexMessage(message)) return;
    const text = `[message/${message.role}] ${new Date(message.createdAt).toISOString()}\n${message.content.trim()}`;
    await this.indexRef({
      refType: "message",
      refId: message.id,
      text,
      sourceUpdatedAt: message.createdAt,
    });
  }

  async indexReflection(reflection: Reflection): Promise<void> {
    const sections: string[] = [
      `[reflection/${reflection.kind}] ${new Date(reflection.periodEnd).toISOString().slice(0, 10)}`,
    ];
    if (reflection.title) sections.push(`title: ${reflection.title}`);
    if (reflection.themes.length > 0) sections.push(`themes: ${reflection.themes.join(", ")}`);
    if (reflection.wins.length > 0) sections.push(`wins: ${reflection.wins.join("; ")}`);
    if (reflection.concerns.length > 0) {
      sections.push(`concerns: ${reflection.concerns.join("; ")}`);
    }
    if (reflection.openThreads.length > 0) {
      sections.push(`open threads: ${reflection.openThreads.join("; ")}`);
    }
    sections.push(reflection.body);
    await this.indexRef({
      refType: "reflection",
      refId: reflection.id,
      text: sections.join("\n"),
      sourceUpdatedAt: reflection.createdAt,
    });
  }

  private async indexRef(input: {
    refType: RefType;
    refId: string;
    text: string;
    sourceUpdatedAt?: number;
  }): Promise<void> {
    if (!this.embedder.enabled) return;
    this.storage.embeddings.deleteForRef(input.refType, input.refId);
    const [vec] = await this.embedder.embedDocuments([input.text]);
    if (!vec) return;
    this.storage.embeddings.insert({
      refType: input.refType,
      refId: input.refId,
      chunkIndex: 0,
      text: input.text,
      embedding: vec,
      model: this.embedder.metadata.model,
      dimension: this.embedder.metadata.dimension,
      sourceUpdatedAt: input.sourceUpdatedAt,
    });
  }

  private shouldIndexMessage(message: Message): boolean {
    const content = message.content.trim();
    if (content.length < 80) return false;
    if (message.role === "user") return true;
    return content.length >= 240;
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
