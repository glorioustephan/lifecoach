import type { Database } from "better-sqlite3";
import type { Artifact, ArtifactOrigin, NewArtifact } from "@lifecoach/schemas";
import { newId, now } from "../../util/ids.js";

interface ArtifactRow {
  id: string;
  type: string;
  title: string;
  body: string;
  category: string | null;
  tags: string;
  confidence: number | null;
  origin: string;
  source_session_id: string | null;
  source_message_ids: string;
  dedup_key: string | null;
  created_at: number;
  updated_at: number;
}

const FULL =
  "id, type, title, body, category, tags, confidence, origin, " +
  "source_session_id, source_message_ids, dedup_key, created_at, updated_at";

const rowToArtifact = (row: ArtifactRow): Artifact => ({
  id: row.id,
  type: row.type,
  title: row.title,
  body: row.body,
  category: row.category,
  tags: JSON.parse(row.tags) as string[],
  confidence: row.confidence,
  origin: row.origin as ArtifactOrigin,
  sourceSessionId: row.source_session_id,
  sourceMessageIds: JSON.parse(row.source_message_ids) as string[],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** Stable dedup key: type + case/space-normalized title. */
export const artifactDedupKey = (type: string, title: string): string =>
  `${type}:${title.toLowerCase().replace(/\s+/g, " ").trim()}`;

export interface ArtifactListFilter {
  type?: string;
  /** Case-insensitive substring match against title + body. */
  q?: string;
  limit?: number;
  offset?: number;
}

export class ArtifactRepository {
  constructor(private readonly db: Database) {}

  create(a: NewArtifact): Artifact {
    const id = newId();
    const ts = now();
    const tags = a.tags ?? [];
    const sourceMessageIds = a.sourceMessageIds ?? [];
    const dedupKey = artifactDedupKey(a.type, a.title);
    this.db
      .prepare(
        `INSERT INTO artifacts(${FULL}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        a.type,
        a.title,
        a.body,
        a.category ?? null,
        JSON.stringify(tags),
        a.confidence ?? null,
        a.origin ?? "manual",
        a.sourceSessionId ?? null,
        JSON.stringify(sourceMessageIds),
        dedupKey,
        ts,
        ts,
      );
    return {
      id,
      type: a.type,
      title: a.title,
      body: a.body,
      category: a.category ?? null,
      tags,
      confidence: a.confidence ?? null,
      origin: (a.origin ?? "manual") as ArtifactOrigin,
      sourceSessionId: a.sourceSessionId ?? null,
      sourceMessageIds,
      createdAt: ts,
      updatedAt: ts,
    };
  }

  get(id: string): Artifact | undefined {
    const row = this.db
      .prepare(`SELECT ${FULL} FROM artifacts WHERE id = ?`)
      .get(id) as ArtifactRow | undefined;
    return row ? rowToArtifact(row) : undefined;
  }

  findByDedup(type: string, title: string): Artifact | undefined {
    const row = this.db
      .prepare(`SELECT ${FULL} FROM artifacts WHERE dedup_key = ?`)
      .get(artifactDedupKey(type, title)) as ArtifactRow | undefined;
    return row ? rowToArtifact(row) : undefined;
  }

  private whereClause(filter: ArtifactListFilter): { sql: string; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.type) {
      conditions.push("type = ?");
      params.push(filter.type);
    }
    if (filter.q && filter.q.trim().length > 0) {
      conditions.push("(title LIKE ? OR body LIKE ?)");
      const like = `%${filter.q.trim()}%`;
      params.push(like, like);
    }
    const sql = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    return { sql, params };
  }

  list(filter: ArtifactListFilter = {}): { items: Artifact[]; total: number } {
    const limit = filter.limit ?? 20;
    const offset = filter.offset ?? 0;
    const { sql: where, params } = this.whereClause(filter);

    const totalRow = this.db
      .prepare(`SELECT COUNT(*) AS c FROM artifacts ${where}`)
      .get(...params) as { c: number };

    const rows = this.db
      .prepare(
        `SELECT ${FULL} FROM artifacts ${where}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as ArtifactRow[];

    return { items: rows.map(rowToArtifact), total: totalRow.c };
  }

  update(
    id: string,
    patch: { title?: string; body?: string; tags?: string[]; category?: string | null },
  ): Artifact | undefined {
    const existing = this.get(id);
    if (!existing) return undefined;
    const ts = now();
    const title = patch.title ?? existing.title;
    this.db
      .prepare(
        `UPDATE artifacts SET title = ?, body = ?, tags = ?, category = ?,
           dedup_key = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        title,
        patch.body ?? existing.body,
        JSON.stringify(patch.tags ?? existing.tags),
        patch.category !== undefined ? patch.category : (existing.category ?? null),
        artifactDedupKey(existing.type, title),
        ts,
        id,
      );
    return this.get(id);
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM artifacts WHERE id = ?").run(id);
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS c FROM artifacts").get() as {
      c: number;
    };
    return row.c;
  }
}
