import type { Database } from "better-sqlite3";
import type { EvidenceRef, InsightPriority } from "@lifecoach/schemas";
import { newId, now } from "../../util/ids.js";
import { parseEvidenceRefs } from "../../util/json.js";

export type AttentionSignalKind =
  | "overdue_task"
  | "stale_goal"
  | "open_reflection_thread"
  | "repeated_concern"
  | "measurement_shift"
  | "ignored_insight";

export type AttentionSignalState = "active" | "acted" | "dismissed";

export interface AttentionSignal {
  id: string;
  kind: AttentionSignalKind;
  title: string;
  body: string;
  priority: InsightPriority;
  evidenceRefs: EvidenceRef[];
  dedupKey: string;
  state: AttentionSignalState;
  firstSeenAt: number;
  lastSeenAt: number;
  actedOnAt: number | null;
  dismissedAt: number | null;
}

export interface UpsertAttentionSignal {
  kind: AttentionSignalKind;
  title: string;
  body: string;
  priority: InsightPriority;
  evidenceRefs: EvidenceRef[];
  dedupKey: string;
}

interface AttentionSignalRow {
  id: string;
  kind: string;
  title: string;
  body: string;
  priority: number;
  evidence_refs: string;
  dedup_key: string;
  state: string;
  first_seen_at: number;
  last_seen_at: number;
  acted_on_at: number | null;
  dismissed_at: number | null;
}

const FULL =
  "id, kind, title, body, priority, evidence_refs, dedup_key, state, first_seen_at, last_seen_at, acted_on_at, dismissed_at";

const rowToSignal = (row: AttentionSignalRow): AttentionSignal => ({
  id: row.id,
  kind: row.kind as AttentionSignalKind,
  title: row.title,
  body: row.body,
  priority: (row.priority as InsightPriority) ?? 1,
  evidenceRefs: parseEvidenceRefs(row.evidence_refs),
  dedupKey: row.dedup_key,
  state: row.state as AttentionSignalState,
  firstSeenAt: row.first_seen_at,
  lastSeenAt: row.last_seen_at,
  actedOnAt: row.acted_on_at,
  dismissedAt: row.dismissed_at,
});

export class AttentionSignalRepository {
  constructor(private readonly db: Database) {}

  upsert(input: UpsertAttentionSignal): AttentionSignal {
    const ts = now();
    const existing = this.db
      .prepare(`SELECT ${FULL} FROM attention_signals WHERE dedup_key = ?`)
      .get(input.dedupKey) as AttentionSignalRow | undefined;

    if (existing) {
      this.db
        .prepare(
          `UPDATE attention_signals SET
             kind = ?, title = ?, body = ?, priority = ?, evidence_refs = ?,
             state = CASE WHEN state = 'dismissed' THEN state ELSE 'active' END,
             last_seen_at = ?
           WHERE dedup_key = ?`,
        )
        .run(
          input.kind,
          input.title,
          input.body,
          input.priority,
          JSON.stringify(input.evidenceRefs),
          ts,
          input.dedupKey,
        );
      return this.get(existing.id)!;
    }

    const id = newId();
    this.db
      .prepare(
        `INSERT INTO attention_signals(${FULL})
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL, NULL)`,
      )
      .run(
        id,
        input.kind,
        input.title,
        input.body,
        input.priority,
        JSON.stringify(input.evidenceRefs),
        input.dedupKey,
        ts,
        ts,
      );
    return this.get(id)!;
  }

  get(id: string): AttentionSignal | undefined {
    const row = this.db
      .prepare(`SELECT ${FULL} FROM attention_signals WHERE id = ?`)
      .get(id) as AttentionSignalRow | undefined;
    return row ? rowToSignal(row) : undefined;
  }

  listActive(limit = 20): AttentionSignal[] {
    const rows = this.db
      .prepare(
        `SELECT ${FULL} FROM attention_signals
         WHERE state = 'active'
         ORDER BY priority DESC, last_seen_at DESC
         LIMIT ?`,
      )
      .all(limit) as AttentionSignalRow[];
    return rows.map(rowToSignal);
  }

  markActed(id: string): void {
    this.db
      .prepare("UPDATE attention_signals SET state = 'acted', acted_on_at = ? WHERE id = ?")
      .run(now(), id);
  }

  markDismissed(id: string): void {
    this.db
      .prepare(
        "UPDATE attention_signals SET state = 'dismissed', dismissed_at = ? WHERE id = ?",
      )
      .run(now(), id);
  }
}
