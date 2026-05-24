import type { Database } from "better-sqlite3";
import type {
  EvidenceRef,
  Insight,
  InsightPriority,
  InsightState,
  NewInsight,
} from "@lifecoach/schemas";
import { newId, now } from "../../util/ids.js";

interface InsightRow {
  id: string;
  topic: string;
  body: string;
  rationale: string | null;
  source_fact_ids: string;
  evidence_refs: string;
  priority: number;
  created_at: number;
  acted_on_at: number | null;
  dismissed_at: number | null;
  snoozed_until: number | null;
}

const FULL =
  "id, topic, body, rationale, source_fact_ids, evidence_refs, priority, created_at, acted_on_at, dismissed_at, snoozed_until";

const parseEvidenceRefs = (raw: string): EvidenceRef[] => {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((ref): ref is EvidenceRef => {
    if (!ref || typeof ref !== "object") return false;
    const maybe = ref as Partial<EvidenceRef>;
    return typeof maybe.refType === "string" && typeof maybe.refId === "string";
  });
};

const rowToInsight = (row: InsightRow): Insight => ({
  id: row.id,
  topic: row.topic,
  body: row.body,
  rationale: row.rationale ?? undefined,
  sourceFactIds: JSON.parse(row.source_fact_ids) as string[],
  evidenceRefs: parseEvidenceRefs(row.evidence_refs),
  priority: (row.priority as InsightPriority) ?? 1,
  createdAt: row.created_at,
  actedOnAt: row.acted_on_at,
  dismissedAt: row.dismissed_at,
  snoozedUntil: row.snoozed_until,
});

export interface InsightListFilter {
  state?: InsightState | "all";
  limit?: number;
}

export class InsightRepository {
  constructor(private readonly db: Database) {}

  create(i: NewInsight): Insight {
    const id = newId();
    const createdAt = now();
    const evidenceRefs = i.evidenceRefs ?? [];
    const sourceFactIds =
      i.sourceFactIds && i.sourceFactIds.length > 0
        ? i.sourceFactIds
        : evidenceRefs
            .filter((ref) => ref.refType === "fact")
            .map((ref) => ref.refId);
    this.db
      .prepare(
        `INSERT INTO insights(
           id, topic, body, rationale, source_fact_ids, evidence_refs, priority, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        i.topic,
        i.body,
        i.rationale ?? null,
        JSON.stringify(sourceFactIds),
        JSON.stringify(evidenceRefs),
        i.priority ?? 1,
        createdAt,
      );
    return {
      id,
      topic: i.topic,
      body: i.body,
      rationale: i.rationale,
      sourceFactIds,
      evidenceRefs,
      priority: (i.priority ?? 1) as InsightPriority,
      createdAt,
      actedOnAt: null,
      dismissedAt: null,
      snoozedUntil: null,
    };
  }

  get(id: string): Insight | undefined {
    const row = this.db
      .prepare(`SELECT ${FULL} FROM insights WHERE id = ?`)
      .get(id) as InsightRow | undefined;
    return row ? rowToInsight(row) : undefined;
  }

  list(filter: InsightListFilter = {}): Insight[] {
    const state = filter.state ?? "active";
    const limit = filter.limit ?? 50;
    let where = "1=1";
    const nowMs = now();
    switch (state) {
      case "active":
        where = `acted_on_at IS NULL AND dismissed_at IS NULL
                 AND (snoozed_until IS NULL OR snoozed_until <= ${nowMs})`;
        break;
      case "acted":
        where = "acted_on_at IS NOT NULL";
        break;
      case "dismissed":
        where = "dismissed_at IS NOT NULL";
        break;
      case "snoozed":
        where = `snoozed_until IS NOT NULL AND snoozed_until > ${nowMs}
                 AND acted_on_at IS NULL AND dismissed_at IS NULL`;
        break;
      case "all":
        where = "1=1";
        break;
    }
    const rows = this.db
      .prepare(
        `SELECT ${FULL} FROM insights WHERE ${where}
         ORDER BY priority DESC, created_at DESC LIMIT ?`,
      )
      .all(limit) as InsightRow[];
    return rows.map(rowToInsight);
  }

  markActed(id: string): void {
    this.db.prepare("UPDATE insights SET acted_on_at = ? WHERE id = ?").run(now(), id);
  }

  markDismissed(id: string): void {
    this.db.prepare("UPDATE insights SET dismissed_at = ? WHERE id = ?").run(now(), id);
  }

  snooze(id: string, until: number): void {
    this.db.prepare("UPDATE insights SET snoozed_until = ? WHERE id = ?").run(until, id);
  }

  hasRecentTopic(topic: string, sinceMs: number): boolean {
    const row = this.db
      .prepare(
        `SELECT id FROM insights
         WHERE LOWER(topic) = LOWER(?)
           AND created_at >= ?
         LIMIT 1`,
      )
      .get(topic.trim(), sinceMs) as { id: string } | undefined;
    return row !== undefined;
  }

  recentByTopic(topic: string, sinceMs: number): Insight[] {
    const rows = this.db
      .prepare(
        `SELECT ${FULL} FROM insights
         WHERE LOWER(topic) = LOWER(?)
           AND created_at >= ?
         ORDER BY created_at DESC`,
      )
      .all(topic.trim(), sinceMs) as InsightRow[];
    return rows.map(rowToInsight);
  }

  /** Clear acted/dismissed/snoozed flags. Useful for undo. */
  reactivate(id: string): void {
    this.db
      .prepare(
        "UPDATE insights SET acted_on_at = NULL, dismissed_at = NULL, snoozed_until = NULL WHERE id = ?",
      )
      .run(id);
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) as c FROM insights").get() as {
      c: number;
    };
    return row.c;
  }
}
