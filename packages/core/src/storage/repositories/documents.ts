import type { Database } from "better-sqlite3";
import type { Document, NewDocument } from "@lifecoach/schemas";
import { newId, now } from "../../util/ids.js";

interface DocumentRow {
  id: string;
  source: string;
  mime: string | null;
  title: string | null;
  body: string;
  metadata: string | null;
  ingested_at: number;
}

const rowToDocument = (row: DocumentRow): Document => ({
  id: row.id,
  source: row.source,
  mime: row.mime ?? undefined,
  title: row.title ?? undefined,
  body: row.body,
  metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
  ingestedAt: row.ingested_at,
});

export class DocumentRepository {
  constructor(private readonly db: Database) {}

  create(doc: NewDocument): Document {
    const id = newId();
    const ingestedAt = now();
    this.db
      .prepare(
        `INSERT INTO documents(id, source, mime, title, body, metadata, ingested_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        doc.source,
        doc.mime ?? null,
        doc.title ?? null,
        doc.body,
        doc.metadata ? JSON.stringify(doc.metadata) : null,
        ingestedAt,
      );
    return { id, ingestedAt, ...doc };
  }

  get(id: string): Document | undefined {
    const row = this.db
      .prepare(
        "SELECT id, source, mime, title, body, metadata, ingested_at FROM documents WHERE id = ?",
      )
      .get(id) as DocumentRow | undefined;
    return row ? rowToDocument(row) : undefined;
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) as c FROM documents").get() as {
      c: number;
    };
    return row.c;
  }
}
