import type { Database } from "better-sqlite3";
import type { Insight, InsightPriority, InsightState, NewInsight } from "@lifecoach/schemas";
import { newId, now } from "../../util/ids.js";
import { parseEvidenceRefs, parseStringArray } from "../../util/json.js";

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

const rowToInsight = (row: InsightRow): Insight => ({
  id: row.id,
  topic: row.topic,
  body: row.body,
  rationale: row.rationale ?? undefined,
  sourceFactIds: parseStringArray(row.source_fact_ids),
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
  offset?: number;
}

/**
 * Reduce a free-form insight topic to a stable "subject key" used by the
 * fuzzy/subject-level dedupe. The Insighter LLM phrases the same subject
 * differently each pass ("Bloodwork results window is now open" vs
 * "Bloodwork results: 12+ days stale"); exact-string matching never fires
 * and the inbox accumulates near-duplicates. The key keeps the first three
 * meaningful tokens so distinct subjects ("Sleep onset", "Sleep apnea") stay
 * distinct while paraphrases collapse together.
 */
const SUBJECT_STOP_WORDS = new Set([
  "a","an","the","is","are","was","were","be","been","being",
  "of","in","on","at","to","for","with","and","or","but","by",
  "as","into","over","under","from","up","down","out","off",
  "your","you","yours","yourself",
  "still","just","now","again","very","really",
  "results","result","window","review","reviewed","unreviewed","overdue","stale",
  "days","day","weeks","week","months","month","prior","multiple","flags","open",
]);

export const normalizeTopic = (topic: string): string => {
  const tokens = topic
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0 && !SUBJECT_STOP_WORDS.has(t));
  if (tokens.length === 0) return topic.trim().toLowerCase();
  return tokens.slice(0, 3).join("-");
};

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
         ORDER BY priority DESC, created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(limit, filter.offset ?? 0) as InsightRow[];
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
    const subjectKey = normalizeTopic(topic);
    const rows = this.db
      .prepare(
        `SELECT ${FULL} FROM insights
         WHERE created_at >= ?
         ORDER BY created_at DESC`,
      )
      .all(sinceMs) as InsightRow[];
    return rows
      .map(rowToInsight)
      .filter((i) => normalizeTopic(i.topic) === subjectKey);
  }

  /**
   * Returns currently-active insights (not acted, not dismissed, not snoozed)
   * sharing the normalized subject key, created within `sinceMs`. Used by the
   * Insighter's 72h subject-level cooldown so the same subject isn't surfaced
   * twice under different headlines.
   */
  activeBySubjectSince(topic: string, sinceMs: number): Insight[] {
    const subjectKey = normalizeTopic(topic);
    const nowMs = now();
    const rows = this.db
      .prepare(
        `SELECT ${FULL} FROM insights
         WHERE created_at >= ?
           AND acted_on_at IS NULL
           AND dismissed_at IS NULL
           AND (snoozed_until IS NULL OR snoozed_until <= ?)
         ORDER BY created_at DESC`,
      )
      .all(sinceMs, nowMs) as InsightRow[];
    return rows
      .map(rowToInsight)
      .filter((i) => normalizeTopic(i.topic) === subjectKey);
  }

  /**
   * True if a DISMISSED insight with the same topic exists since `sinceMs`.
   * Used to honor long-suppression (e.g. 6–12 months for recurring-expense
   * downgrade suggestions): if the user already said no, don't keep raising it.
   */
  dismissedByTopicSince(topic: string, sinceMs: number): boolean {
    const row = this.db
      .prepare(
        `SELECT id FROM insights
         WHERE LOWER(topic) = LOWER(?)
           AND dismissed_at IS NOT NULL
           AND dismissed_at >= ?
         LIMIT 1`,
      )
      .get(topic.trim(), sinceMs) as { id: string } | undefined;
    return row !== undefined;
  }

  /** Clear acted/dismissed/snoozed flags. Useful for undo. */
  reactivate(id: string): void {
    this.db
      .prepare(
        "UPDATE insights SET acted_on_at = NULL, dismissed_at = NULL, snoozed_until = NULL WHERE id = ?",
      )
      .run(id);
  }

  count(filter: Pick<InsightListFilter, "state"> = {}): number {
    const state = filter.state ?? "all";
    const nowMs = now();
    let where = "1=1";
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
    const row = this.db.prepare(`SELECT COUNT(*) as c FROM insights WHERE ${where}`).get() as {
      c: number;
    };
    return row.c;
  }
}
