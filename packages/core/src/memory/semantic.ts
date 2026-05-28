import type {
  Fact,
  FactUpdate,
  Message,
  NewFact,
  RecallHit,
  RecallScope,
  Reflection,
} from "@lifecoach/schemas";
import type { Storage, RefType } from "../storage/index.js";
import type { Embedder } from "../embeddings/index.js";
import { LifecoachError } from "../util/errors.js";

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

  /**
   * Public alias for `forget` — the route layer reads more clearly as
   * `forgetFact(id)` than `forget(id)`, and gives us a hook to add
   * audit/event emission later without touching callers.
   */
  forgetFact(id: string): void {
    this.forget(id);
  }

  /**
   * In-place correction of a stored fact. After updating the row, the
   * existing embedding is dropped and a fresh one is generated from the
   * corrected text so semantic recall immediately reflects the change.
   * If re-embedding fails we still return the updated row — the user's
   * edit isn't lost, and recall simply won't hit this fact until the next
   * re-index. Better that than a stale embedding pointing at the old text.
   */
  async updateFact(id: string, patch: FactUpdate): Promise<Fact> {
    const updated = this.storage.facts.update(id, patch);
    if (!updated) {
      throw new LifecoachError(`Fact ${id} not found or already deleted`);
    }
    this.storage.embeddings.deleteForRef("fact", id);
    try {
      await this.indexFact(updated);
    } catch (err) {
      console.warn(
        `[semantic] re-index after fact update failed for ${id} (non-fatal):`,
        err instanceof Error ? err.message : String(err),
      );
    }
    return updated;
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
      case "goals":
        return "goal";
      case "milestones":
        return "milestone";
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

    // Goals: substring across every aspirational facet so the keyword path
    // mirrors what the embedder sees in goal-indexer.ts.
    if (scope === "goals" || scope === "all") {
      const db = this.storage.handle.db;
      const pattern = `%${lower}%`;
      const rows = db
        .prepare(
          `SELECT id, kind, title,
                  COALESCE(outcome,'') AS outcome,
                  COALESCE(obstacle,'') AS obstacle,
                  COALESCE(implementation_intention,'') AS plan,
                  COALESCE(identity_statement,'') AS identity,
                  COALESCE(body,'') AS body
           FROM goals
           WHERE archived_at IS NULL
             AND (LOWER(title) LIKE ?
                  OR LOWER(COALESCE(outcome,'')) LIKE ?
                  OR LOWER(COALESCE(obstacle,'')) LIKE ?
                  OR LOWER(COALESCE(implementation_intention,'')) LIKE ?
                  OR LOWER(COALESCE(identity_statement,'')) LIKE ?
                  OR LOWER(COALESCE(body,'')) LIKE ?)
           ORDER BY (status = 'active') DESC, updated_at DESC
           LIMIT ?`,
        )
        .all(pattern, pattern, pattern, pattern, pattern, pattern, limit) as {
        id: string;
        kind: string;
        title: string;
        outcome: string;
        obstacle: string;
        plan: string;
        identity: string;
        body: string;
      }[];
      for (const g of rows) {
        const detail = g.outcome || g.plan || g.identity || g.body || g.obstacle;
        hits.push({
          refType: "goal",
          refId: g.id,
          text: `[goal:${g.kind}] ${g.title}${detail ? " — " + detail.slice(0, 200) : ""}`,
          score: 0.4,
        });
      }
    }

    // Milestones: substring on title + body. Prefixed with parent goal title
    // to match the embedder's text shape.
    if (scope === "milestones" || scope === "all") {
      const db = this.storage.handle.db;
      const pattern = `%${lower}%`;
      const rows = db
        .prepare(
          `SELECT m.id AS id, m.title AS title, COALESCE(m.body,'') AS body,
                  g.title AS goal_title
           FROM milestones m
           JOIN goals g ON g.id = m.goal_id
           WHERE g.archived_at IS NULL
             AND (LOWER(m.title) LIKE ? OR LOWER(COALESCE(m.body,'')) LIKE ?)
           ORDER BY m.updated_at DESC
           LIMIT ?`,
        )
        .all(pattern, pattern, limit) as {
        id: string;
        title: string;
        body: string;
        goal_title: string;
      }[];
      for (const m of rows) {
        hits.push({
          refType: "milestone",
          refId: m.id,
          text: `[milestone] ${m.goal_title}: ${m.title}${m.body ? " — " + m.body.slice(0, 200) : ""}`,
          score: 0.4,
        });
      }
    }

    return hits.slice(0, limit);
  }
}
