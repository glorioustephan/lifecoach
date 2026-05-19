import type { Storage } from "../storage/index.js";
import { LifecoachError } from "../util/errors.js";

export interface ForgetDocumentResult {
  documentId: string;
  factsRemoved: number;
  measurementsRemoved: number;
  embeddingRefsRemoved: number;
  embeddingVectorsRemoved: number;
  ingestedFilesRemoved: number;
}

/**
 * Fully purge a document and everything derived from it, in a single
 * transaction. This is the canonical way to undo an ingestion.
 *
 * Order matters — sqlite-vec rows live in the same DB but you can't rely on
 * SQL-level cascade for the FLOAT[N] virtual table. We compute rowids first,
 * delete vectors, then delete pointers, then structural rows.
 *
 * Returns a per-table count so the caller can render a confirmation message.
 */
export const forgetDocument = (
  storage: Storage,
  documentId: string,
): ForgetDocumentResult => {
  const doc = storage.documents.get(documentId);
  if (!doc) {
    throw new LifecoachError(`No document with id ${documentId}`, "DOC_NOT_FOUND");
  }

  const db = storage.handle.db;
  const tx = db.transaction((): ForgetDocumentResult => {
    // 1. Find facts derived from this document (extractor writes
    //    source='document:<id>'). Collect IDs so we can wipe their
    //    embeddings too.
    const factIds = (
      db
        .prepare("SELECT id FROM facts WHERE source = ?")
        .all(`document:${documentId}`) as { id: string }[]
    ).map((r) => r.id);

    // 2. Find embedding rowids to delete — both the document's own chunks
    //    AND every derived fact's embedding.
    const refTypes: Array<{ type: string; id: string }> = [
      { type: "document", id: documentId },
      ...factIds.map((id) => ({ type: "fact", id })),
    ];

    const rowidPlaceholders = refTypes.map(() => "(?, ?)").join(", ");
    const flatBindings = refTypes.flatMap((r) => [r.type, r.id]);
    const rowidRows =
      refTypes.length === 0
        ? []
        : (db
            .prepare(
              `SELECT embedding_rowid FROM embedding_refs
               WHERE (ref_type, ref_id) IN (VALUES ${rowidPlaceholders})`,
            )
            .all(...flatBindings) as { embedding_rowid: number }[]);

    // 3. Delete the vec0 rows by rowid. Use a prepared statement because vec0
    //    doesn't support multi-row DELETE with VALUES.
    const delVec = db.prepare("DELETE FROM embeddings WHERE rowid = ?");
    for (const r of rowidRows) delVec.run(r.embedding_rowid);

    // 4. Delete embedding_refs (the pointer table).
    const delRefsForDoc = db
      .prepare("DELETE FROM embedding_refs WHERE ref_type = 'document' AND ref_id = ?")
      .run(documentId);
    let embeddingRefsRemoved = delRefsForDoc.changes;
    if (factIds.length > 0) {
      const placeholders = factIds.map(() => "?").join(", ");
      const delRefsForFacts = db
        .prepare(
          `DELETE FROM embedding_refs WHERE ref_type = 'fact' AND ref_id IN (${placeholders})`,
        )
        .run(...factIds);
      embeddingRefsRemoved += delRefsForFacts.changes;
    }

    // 5. Delete measurements that pointed to this document.
    const delMeasurements = db
      .prepare("DELETE FROM measurements WHERE source_document_id = ?")
      .run(documentId);

    // 6. Delete the derived facts.
    let factsRemoved = 0;
    if (factIds.length > 0) {
      const placeholders = factIds.map(() => "?").join(", ");
      factsRemoved = db
        .prepare(`DELETE FROM facts WHERE id IN (${placeholders})`)
        .run(...factIds).changes;
    }

    // 7. Delete the document. ingested_files has ON DELETE CASCADE so its
    //    row gets removed in the same statement.
    const ingestedRowsBefore = db
      .prepare("SELECT COUNT(*) AS c FROM ingested_files WHERE document_id = ?")
      .get(documentId) as { c: number };
    db.prepare("DELETE FROM documents WHERE id = ?").run(documentId);

    return {
      documentId,
      factsRemoved,
      measurementsRemoved: delMeasurements.changes,
      embeddingRefsRemoved,
      embeddingVectorsRemoved: rowidRows.length,
      ingestedFilesRemoved: ingestedRowsBefore.c,
    };
  });

  return tx();
};
