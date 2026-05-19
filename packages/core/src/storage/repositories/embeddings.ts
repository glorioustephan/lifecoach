import type { Database } from "better-sqlite3";
import type { RecallHit } from "@lifecoach/schemas";
import { now } from "../../util/ids.js";

export type RefType = "fact" | "document" | "message" | "reflection" | "task";

export interface EmbeddingInsert {
  refType: RefType;
  refId: string;
  chunkIndex: number;
  text: string;
  embedding: number[];
}

export class EmbeddingRepository {
  constructor(private readonly db: Database, private readonly dim: number) {}

  insert(input: EmbeddingInsert): void {
    if (input.embedding.length !== this.dim) {
      throw new Error(
        `Embedding dimension mismatch: got ${input.embedding.length}, expected ${this.dim}`,
      );
    }
    const buf = Buffer.from(new Float32Array(input.embedding).buffer);
    const result = this.db
      .prepare("INSERT INTO embeddings(embedding) VALUES (?)")
      .run(buf);
    const rowid = Number(result.lastInsertRowid);
    this.db
      .prepare(
        `INSERT INTO embedding_refs(embedding_rowid, ref_type, ref_id, chunk_index, text, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(rowid, input.refType, input.refId, input.chunkIndex, input.text, now());
  }

  deleteForRef(refType: RefType, refId: string): void {
    const rows = this.db
      .prepare("SELECT embedding_rowid FROM embedding_refs WHERE ref_type = ? AND ref_id = ?")
      .all(refType, refId) as { embedding_rowid: number }[];
    for (const r of rows) {
      this.db.prepare("DELETE FROM embeddings WHERE rowid = ?").run(r.embedding_rowid);
    }
    this.db
      .prepare("DELETE FROM embedding_refs WHERE ref_type = ? AND ref_id = ?")
      .run(refType, refId);
  }

  search(
    queryEmbedding: number[],
    opts: { limit?: number; refType?: RefType } = {},
  ): RecallHit[] {
    if (queryEmbedding.length !== this.dim) {
      throw new Error(
        `Query embedding dimension mismatch: got ${queryEmbedding.length}, expected ${this.dim}`,
      );
    }
    const limit = opts.limit ?? 10;
    const buf = Buffer.from(new Float32Array(queryEmbedding).buffer);

    // sqlite-vec requires `k = ?` (or LIMIT) directly on the virtual-table query,
    // before any JOINs. Use a CTE for the KNN, then join + filter, then truncate.
    // When filtering by refType, over-fetch so post-filter results aren't starved.
    const knnK = opts.refType ? Math.max(limit * 5, 25) : limit;
    const sql = `
      WITH knn AS (
        SELECT rowid, distance
        FROM embeddings
        WHERE embedding MATCH ? AND k = ?
      )
      SELECT knn.rowid as rowid, knn.distance as distance,
             r.ref_type as ref_type, r.ref_id as ref_id,
             r.chunk_index as chunk_index, r.text as text
      FROM knn
      JOIN embedding_refs r ON r.embedding_rowid = knn.rowid
      ${opts.refType ? "WHERE r.ref_type = ?" : ""}
      ORDER BY knn.distance ASC
      LIMIT ?
    `;
    const params: unknown[] = opts.refType
      ? [buf, knnK, opts.refType, limit]
      : [buf, knnK, limit];
    const rows = this.db.prepare(sql).all(...params) as {
      rowid: number;
      distance: number;
      ref_type: string;
      ref_id: string;
      chunk_index: number;
      text: string;
    }[];

    return rows.map((r) => ({
      refType: r.ref_type as RefType,
      refId: r.ref_id,
      text: r.text,
      score: 1 / (1 + r.distance),
      chunkIndex: r.chunk_index,
    }));
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) as c FROM embedding_refs").get() as {
      c: number;
    };
    return row.c;
  }
}
