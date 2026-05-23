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
