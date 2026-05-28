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
      case "finance":
        return "finance";
      case "all":
      default:
        return undefined;
    }
  }

  /**
   * Index a financial NARRATIVE (monthly rollup, money moment) — never a raw
   * row. `refId` is the caller's stable id (e.g. "month:2026-05" or
   * "insight:<id>") so re-indexing replaces the previous embedding cleanly.
   */
  async indexFinanceNarrative(input: {
    refId: string;
    text: string;
    sourceUpdatedAt?: number;
  }): Promise<void> {
    await this.indexRef({
      refType: "finance",
      refId: input.refId,
      text: input.text,
      ...(input.sourceUpdatedAt !== undefined ? { sourceUpdatedAt: input.sourceUpdatedAt } : {}),
    });
  }

  private keywordFallback(
    query: string,
    scope: RecallScope,
    limit: number,
  ): RecallHit[] {
    const hits: RecallHit[] = [];
    const lower = query.toLowerCase();

    // Facts: full-text substring match on subject + body.
    if (scope === "facts" || scope === "all") {
      const facts = this.storage.facts.keywordSearch(query, limit);
      for (const f of facts) {
        hits.push({
          refType: "fact",
          refId: f.id,
          text: `[${f.category}/${f.subject}] ${f.body}`,
          score: 0.5,
        });
      }
    }

    // Messages: substring match on content. Mirrors keywordSearch pattern.
    if (scope === "messages" || scope === "all") {
      const db = this.storage.handle.db;
      const pattern = `%${lower}%`;
      const rows = db
        .prepare(
          `SELECT id, role, content, created_at AS createdAt
           FROM messages
           WHERE LOWER(content) LIKE ?
           ORDER BY created_at DESC
           LIMIT ?`,
        )
        .all(pattern, limit) as { id: string; role: string; content: string; createdAt: number }[];
      for (const m of rows) {
        hits.push({
          refType: "message",
          refId: m.id,
          text: `[message/${m.role}] ${m.content.slice(0, 300)}`,
          score: 0.4,
        });
      }
    }

    // Documents: substring match on title + body prefix.
    if (scope === "documents" || scope === "all") {
      const db = this.storage.handle.db;
      const pattern = `%${lower}%`;
      const rows = db
        .prepare(
          `SELECT id, source, title, SUBSTR(body, 1, 300) AS bodyPreview
           FROM documents
           WHERE LOWER(COALESCE(title,'')) LIKE ? OR LOWER(body) LIKE ?
           ORDER BY ingested_at DESC
           LIMIT ?`,
        )
        .all(pattern, pattern, limit) as { id: string; source: string; title: string | null; bodyPreview: string }[];
      for (const d of rows) {
        hits.push({
          refType: "document",
          refId: d.id,
          text: `[document] ${d.title ?? d.source}: ${d.bodyPreview}`,
          score: 0.4,
        });
      }
    }

    // Reflections: substring match on body.
    if (scope === "reflections" || scope === "all") {
      const db = this.storage.handle.db;
      const pattern = `%${lower}%`;
      const rows = db
        .prepare(
          `SELECT id, kind, period_end AS periodEnd, SUBSTR(body, 1, 300) AS bodyPreview
           FROM reflections
           WHERE LOWER(body) LIKE ?
           ORDER BY period_end DESC
           LIMIT ?`,
        )
        .all(pattern, limit) as { id: string; kind: string; periodEnd: number; bodyPreview: string }[];
      for (const r of rows) {
        hits.push({
          refType: "reflection",
          refId: r.id,
          text: `[reflection/${r.kind}] ${new Date(r.periodEnd).toISOString().slice(0, 10)}: ${r.bodyPreview}`,
          score: 0.4,
        });
      }
    }

    // Tasks: substring match on content + description.
    if (scope === "tasks" || scope === "all") {
      const db = this.storage.handle.db;
      const pattern = `%${lower}%`;
      const rows = db
        .prepare(
          `SELECT id, content, COALESCE(description,'') AS description
           FROM tasks
           WHERE completed_at IS NULL
             AND (LOWER(content) LIKE ? OR LOWER(COALESCE(description,'')) LIKE ?)
           ORDER BY created_at DESC
           LIMIT ?`,
        )
        .all(pattern, pattern, limit) as { id: string; content: string; description: string }[];
      for (const t of rows) {
        hits.push({
          refType: "task",
          refId: t.id,
          text: `[task] ${t.content}${t.description ? ": " + t.description.slice(0, 200) : ""}`,
          score: 0.4,
        });
      }
    }

    return hits.slice(0, limit);
  }
}
