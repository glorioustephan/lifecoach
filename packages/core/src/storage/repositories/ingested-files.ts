import type { Database } from "better-sqlite3";
import { now } from "../../util/ids.js";

export interface IngestedFile {
  hash: string;
  path: string;
  documentId: string;
  sizeBytes: number;
  ingestedAt: number;
}

interface IngestedFileRow {
  hash: string;
  path: string;
  document_id: string;
  size_bytes: number;
  ingested_at: number;
}

const rowTo = (row: IngestedFileRow): IngestedFile => ({
  hash: row.hash,
  path: row.path,
  documentId: row.document_id,
  sizeBytes: row.size_bytes,
  ingestedAt: row.ingested_at,
});

export class IngestedFileRepository {
  constructor(private readonly db: Database) {}

  getByHash(hash: string): IngestedFile | undefined {
    const row = this.db
      .prepare(
        "SELECT hash, path, document_id, size_bytes, ingested_at FROM ingested_files WHERE hash = ?",
      )
      .get(hash) as IngestedFileRow | undefined;
    return row ? rowTo(row) : undefined;
  }

  record(input: {
    hash: string;
    path: string;
    documentId: string;
    sizeBytes: number;
  }): IngestedFile {
    const ingestedAt = now();
    this.db
      .prepare(
        `INSERT INTO ingested_files(hash, path, document_id, size_bytes, ingested_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(hash) DO UPDATE SET path = excluded.path, ingested_at = excluded.ingested_at`,
      )
      .run(input.hash, input.path, input.documentId, input.sizeBytes, ingestedAt);
    return {
      hash: input.hash,
      path: input.path,
      documentId: input.documentId,
      sizeBytes: input.sizeBytes,
      ingestedAt,
    };
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) as c FROM ingested_files").get() as {
      c: number;
    };
    return row.c;
  }
}
