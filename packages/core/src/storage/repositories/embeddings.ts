import type { Database } from "better-sqlite3";
import type { RecallHit } from "@lifecoach/schemas";
import { createHash } from "node:crypto";
import { now } from "../../util/ids.js";

export type RefType =
  | "fact"
  | "document"
  | "message"
  | "reflection"
  | "task"
  // "finance" carries indexed financial NARRATIVES (monthly rollups, "money
  // moments" — significant decisions/insights). Never raw transaction rows.
  | "finance"
  // Aspirational anchor + WOOP fields chunked per goal. One row per goal;
  // chunk 0 contains title + outcome + obstacle + plan + identity statement
  // packed together so semantic recall hits any facet. See
  // memory/goal-indexer.ts.
  | "goal"
  // One row per milestone, prefixed with parent goal title so recall returns
  // the right context even when the milestone title is terse.
  | "milestone";

export interface EmbeddingInsert {
  refType: RefType;
  refId: string;
  chunkIndex: number;
  text: string;
  embedding: number[];
  model?: string | undefined;
  dimension?: number | undefined;
  sourceUpdatedAt?: number | undefined;
}

export interface EmbeddingSearchOptions {
  limit?: number | undefined;
  refType?: RefType | undefined;
  maxCandidates?: number | undefined;
}

const hashText = (text: string): string =>
  createHash("sha256").update(text).digest("hex");

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
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO embedding_refs(
           embedding_rowid, ref_type, ref_id, chunk_index, text, created_at,
           model, dimension, text_hash, embedded_at, source_updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        rowid,
        input.refType,
        input.refId,
        input.chunkIndex,
        input.text,
        ts,
        input.model ?? null,
        input.dimension ?? input.embedding.length,
        hashText(input.text),
        ts,
        input.sourceUpdatedAt ?? null,
      );
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
    opts: EmbeddingSearchOptions = {},
  ): RecallHit[] {
    if (queryEmbedding.length !== this.dim) {
      throw new Error(
        `Query embedding dimension mismatch: got ${queryEmbedding.length}, expected ${this.dim}`,
      );
    }
    const limit = opts.limit ?? 10;
    const buf = Buffer.from(new Float32Array(queryEmbedding).buffer);
    const maxCandidates = opts.maxCandidates ?? Math.max(limit * 12, 100);

    // sqlite-vec requires `k = ?` (or LIMIT) directly on the virtual-table query,
    // before any JOINs. Use a CTE for the KNN, then join + filter, then truncate.
    // When filtering by refType, adaptively over-fetch so rare scopes aren't
    // starved by a global nearest-neighbor pool.
    const initialK = opts.refType ? Math.max(limit * 8, 50) : limit;
    let knnK = Math.min(Math.max(initialK, limit), maxCandidates);

    const fetch = (k: number): RecallHit[] => {
      const where: string[] = [
        "(r.ref_type != 'fact' OR (f.id IS NOT NULL AND f.valid_to IS NULL))",
        "(r.ref_type != 'task' OR (t.id IS NOT NULL AND t.completed_at IS NULL))",
      ];
      if (opts.refType) where.push("r.ref_type = ?");

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
      LEFT JOIN facts f ON r.ref_type = 'fact' AND f.id = r.ref_id
      LEFT JOIN tasks t ON r.ref_type = 'task' AND t.id = r.ref_id
      WHERE ${where.join(" AND ")}
      ORDER BY knn.distance ASC
      LIMIT ?
    `;
      const params: unknown[] = opts.refType
        ? [buf, k, opts.refType, limit]
        : [buf, k, limit];
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
    };

    let hits = fetch(knnK);
    while (opts.refType && hits.length < limit && knnK < maxCandidates) {
      knnK = Math.min(knnK * 2, maxCandidates);
      hits = fetch(knnK);
    }
    return hits;
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) as c FROM embedding_refs").get() as {
      c: number;
    };
    return row.c;
  }
}
