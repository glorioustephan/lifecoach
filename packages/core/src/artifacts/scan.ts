import { detectArtifactTypes, type Artifact, type ArtifactOrigin } from "@lifecoach/schemas";
import type { Storage } from "../storage/index.js";
import type { ArtifactExtractor } from "./extractor.js";

const ONE_DAY = 24 * 60 * 60 * 1000;
/** Cap the assistant text we feed per conversation, newest content first. */
const MAX_TEXT_CHARS = 16_000;

export interface ScanOptions {
  /** Only consider conversations with assistant messages at/after this time. */
  sinceMs?: number;
  /** Drop artifacts below this confidence. */
  minConfidence?: number;
  origin?: ArtifactOrigin;
  /** Max candidate sessions to process in one pass. */
  sessionLimit?: number;
}

export interface ScanResult {
  sessionsScanned: number;
  candidateSessions: number;
  created: Artifact[];
  /** Latest message timestamp observed — use it to advance the cron cursor. */
  scannedUntil: number;
}

interface ScanDeps {
  storage: Storage;
  extractor: ArtifactExtractor;
}

/**
 * Sweep recent conversations for artifacts and persist the high-confidence ones.
 *
 * Token discipline: each candidate session is first gated by the pure
 * `detect()` heuristics; sessions with no plausible artifact never reach the
 * LLM. Matched sessions get exactly one extraction call, scoped to the matched
 * types. Duplicates (same type + normalized title) are skipped.
 *
 * This is the shared path used by both the daily cron and the on-demand
 * "Generate now" endpoint. It does NOT read or write the enable/streak settings
 * — that policy lives in the cron command.
 */
export const scanArtifacts = async (
  deps: ScanDeps,
  opts: ScanOptions = {},
): Promise<ScanResult> => {
  const { storage, extractor } = deps;
  const since = opts.sinceMs ?? Date.now() - 7 * ONE_DAY;
  const minConfidence = opts.minConfidence ?? 0.7;
  const origin = opts.origin ?? "cron";
  const sessionLimit = opts.sessionLimit ?? 50;

  const db = storage.handle.db;
  const sessionRows = db
    .prepare(
      `SELECT session_id AS sessionId, MAX(created_at) AS lastAt
       FROM messages
       WHERE created_at >= ? AND role = 'assistant'
       GROUP BY session_id
       ORDER BY lastAt DESC
       LIMIT ?`,
    )
    .all(since, sessionLimit) as Array<{ sessionId: string; lastAt: number }>;

  let scannedUntil = since;
  let candidateSessions = 0;
  const created: Artifact[] = [];

  for (const { sessionId, lastAt } of sessionRows) {
    if (lastAt > scannedUntil) scannedUntil = lastAt;

    const messages = storage.messages.forSession(sessionId);
    const assistant = messages.filter((m) => m.role === "assistant");
    if (assistant.length === 0) continue;

    // Newest content first, bounded — recipes the user just settled on matter most.
    let text = "";
    const usedIds: string[] = [];
    for (let i = assistant.length - 1; i >= 0; i -= 1) {
      const m = assistant[i]!;
      if (text.length + m.content.length > MAX_TEXT_CHARS) break;
      text = `${m.content}\n\n${text}`;
      usedIds.push(m.id);
    }

    const types = detectArtifactTypes(text);
    if (types.length === 0) continue; // no tokens spent
    candidateSessions += 1;

    const extracted = await extractor.extractFromText(text, { types });
    for (const art of extracted) {
      if (art.confidence < minConfidence) continue;
      if (storage.artifacts.findByDedup(art.type, art.formatted.title)) continue;
      const row = storage.artifacts.create({
        type: art.type,
        title: art.formatted.title,
        body: art.formatted.body,
        category: art.formatted.category ?? null,
        tags: art.formatted.tags,
        confidence: art.confidence,
        origin,
        sourceSessionId: sessionId,
        sourceMessageIds: usedIds,
      });
      created.push(row);
    }
  }

  return {
    sessionsScanned: sessionRows.length,
    candidateSessions,
    created,
    scannedUntil,
  };
};

/** Documents shorter than this aren't worth an extraction call. */
const MIN_DOC_BODY_CHARS = 200;

export interface DocumentScanResult {
  documentsScanned: number;
  /** Documents whose body tripped a detection heuristic (and cost a model call). */
  candidateDocuments: number;
  created: Artifact[];
}

/**
 * Sweep ingested DOCUMENTS for artifacts — the counterpart to `scanArtifacts`,
 * which only ever looked at chat. Without this, a recipe living in an ingested
 * markdown/Capacities-export document could never reach the Recipes view; the
 * only path was the user re-typing it into a conversation.
 *
 * Title-only stubs (Capacities directory entries, flagged `contentMirrored:false`)
 * and trivially short bodies are skipped before any token is spent. Dedup by
 * (type, normalized title) keeps re-runs idempotent. Pass `sinceMs: 0` for a
 * one-time backfill of the whole corpus; the cron passes the incremental cursor.
 */
export const scanDocumentArtifacts = async (
  deps: ScanDeps,
  opts: ScanOptions = {},
): Promise<DocumentScanResult> => {
  const { storage, extractor } = deps;
  const since = opts.sinceMs ?? Date.now() - 7 * ONE_DAY;
  const minConfidence = opts.minConfidence ?? 0.7;
  const origin = opts.origin ?? "cron";
  const limit = opts.sessionLimit ?? 500;

  const docs = storage.documents.list({ limit });
  let candidateDocuments = 0;
  const created: Artifact[] = [];

  for (const doc of docs) {
    // list() is ordered newest-first; once we pass the cursor, the rest are older.
    if (doc.ingestedAt < since) break;
    // Skip title-only stubs and bodies too short to plausibly hold an artifact.
    if (doc.metadata?.["contentMirrored"] === false) continue;
    const body = doc.body ?? "";
    if (body.length < MIN_DOC_BODY_CHARS) continue;

    const text = body.length > MAX_TEXT_CHARS ? body.slice(0, MAX_TEXT_CHARS) : body;
    const types = detectArtifactTypes(text);
    if (types.length === 0) continue; // no tokens spent
    candidateDocuments += 1;

    const extracted = await extractor.extractFromText(text, { types });
    for (const art of extracted) {
      if (art.confidence < minConfidence) continue;
      if (storage.artifacts.findByDedup(art.type, art.formatted.title)) continue;
      const row = storage.artifacts.create({
        type: art.type,
        title: art.formatted.title,
        body: art.formatted.body,
        category: art.formatted.category ?? null,
        tags: art.formatted.tags,
        confidence: art.confidence,
        origin,
        sourceDocumentId: doc.id,
        sourceMessageIds: [],
      });
      created.push(row);
    }
  }

  return { documentsScanned: docs.length, candidateDocuments, created };
};
