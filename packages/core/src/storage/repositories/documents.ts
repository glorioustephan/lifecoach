import type { Database } from "better-sqlite3";
import type { Document, NewDocument } from "@lifecoach/schemas";
import { newId, now } from "../../util/ids.js";
import { parseRecord } from "../../util/json.js";

interface DocumentRow {
  id: string;
  source: string;
  mime: string | null;
  title: string | null;
  body: string;
  metadata: string | null;
  ingested_at: number;
  external_id: string | null;
  external_source: string | null;
}

const FULL_COLUMNS =
  "id, source, mime, title, body, metadata, ingested_at, external_id, external_source";

const rowToDocument = (row: DocumentRow): Document => ({
  id: row.id,
  source: row.source,
  mime: row.mime ?? undefined,
  title: row.title ?? undefined,
  body: row.body,
  metadata: parseRecord(row.metadata),
  ingestedAt: row.ingested_at,
  externalId: row.external_id,
  externalSource: row.external_source,
});

export interface DocumentListFilter {
  source?: string;
  externalSource?: string;
  limit?: number;
  offset?: number;
}

export class DocumentRepository {
  constructor(private readonly db: Database) {}

  create(doc: NewDocument): Document {
    const id = newId();
    const ingestedAt = now();
    this.db
      .prepare(
        `INSERT INTO documents(${FULL_COLUMNS})
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        doc.source,
        doc.mime ?? null,
        doc.title ?? null,
        doc.body,
        doc.metadata ? JSON.stringify(doc.metadata) : null,
        ingestedAt,
        doc.externalId ?? null,
        doc.externalSource ?? null,
      );
    return { id, ingestedAt, ...doc };
  }

  get(id: string): Document | undefined {
    const row = this.db
      .prepare(`SELECT ${FULL_COLUMNS} FROM documents WHERE id = ?`)
      .get(id) as DocumentRow | undefined;
    return row ? rowToDocument(row) : undefined;
  }

  getByExternal(source: string, externalId: string): Document | undefined {
    const row = this.db
      .prepare(
        `SELECT ${FULL_COLUMNS} FROM documents WHERE external_source = ? AND external_id = ?`,
      )
      .get(source, externalId) as DocumentRow | undefined;
    return row ? rowToDocument(row) : undefined;
  }

  list(filter: DocumentListFilter = {}): Document[] {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.source) {
      conditions.push("source = ?");
      params.push(filter.source);
    }
    if (filter.externalSource) {
      conditions.push("external_source = ?");
      params.push(filter.externalSource);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filter.limit ?? 200;
    const offset = filter.offset ?? 0;
    const sql = `SELECT ${FULL_COLUMNS} FROM documents ${where}
                 ORDER BY ingested_at DESC
                 LIMIT ? OFFSET ?`;
    const rows = this.db.prepare(sql).all(...params, limit, offset) as DocumentRow[];
    return rows.map(rowToDocument);
  }

  /**
   * Upsert by (external_source, external_id). For idempotent syncs from external
   * systems like Capacities. Locally-ingested files (no external IDs) must keep
   * using `create()`.
   *
   * When the existing row has the same body+title+metadata, we still bump
   * `ingested_at` so the caller can identify which rows were touched in this
   * sync pass — useful for cleanup of stale rows.
   */
  upsertByExternal(doc: NewDocument): Document {
    if (!doc.externalSource || !doc.externalId) {
      throw new Error("upsertByExternal requires externalSource + externalId");
    }
    const existing = this.getByExternal(doc.externalSource, doc.externalId);
    const ts = now();

    if (existing) {
      this.db
        .prepare(
          `UPDATE documents SET
              source = ?, mime = ?, title = ?, body = ?, metadata = ?, ingested_at = ?
           WHERE id = ?`,
        )
        .run(
          doc.source,
          doc.mime ?? null,
          doc.title ?? null,
          doc.body,
          doc.metadata ? JSON.stringify(doc.metadata) : null,
          ts,
          existing.id,
        );
      return { ...existing, ...doc, ingestedAt: ts };
    }

    const id = newId();
    this.db
      .prepare(
        `INSERT INTO documents(${FULL_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        doc.source,
        doc.mime ?? null,
        doc.title ?? null,
        doc.body,
        doc.metadata ? JSON.stringify(doc.metadata) : null,
        ts,
        doc.externalId,
        doc.externalSource,
      );
    return {
      id,
      ingestedAt: ts,
      source: doc.source,
      mime: doc.mime,
      title: doc.title,
      body: doc.body,
      metadata: doc.metadata,
      externalId: doc.externalId,
      externalSource: doc.externalSource,
    };
  }

  /**
   * Remove documents from a given external source whose external_ids are NOT
   * in the provided set. Caller is responsible for cascading any derived
   * embeddings/facts (see forget-document.ts for the pattern).
   *
   * Returns the ids of the removed documents.
   */
  deleteStaleByExternal(source: string, keepExternalIds: Set<string>): string[] {
    const rows = this.db
      .prepare(
        "SELECT id, external_id FROM documents WHERE external_source = ?",
      )
      .all(source) as { id: string; external_id: string }[];
    const removed: string[] = [];
    const del = this.db.prepare("DELETE FROM documents WHERE id = ?");
    for (const row of rows) {
      if (!keepExternalIds.has(row.external_id)) {
        del.run(row.id);
        removed.push(row.id);
      }
    }
    return removed;
  }

  count(filter: DocumentListFilter = {}): number {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.source) {
      conditions.push("source = ?");
      params.push(filter.source);
    }
    if (filter.externalSource) {
      conditions.push("external_source = ?");
      params.push(filter.externalSource);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const row = this.db
      .prepare(`SELECT COUNT(*) as c FROM documents ${where}`)
      .get(...params) as { c: number };
    return row.c;
  }
}
