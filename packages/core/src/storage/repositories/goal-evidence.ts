import type { Database } from "better-sqlite3";
import type {
  GoalEvidence,
  GoalEvidenceOrigin,
  GoalEvidenceSourceRefType,
  NewGoalEvidence,
} from "@lifecoach/schemas";
import { newId, now } from "../../util/ids.js";

interface EvidenceRow {
  id: string;
  goal_id: string;
  milestone_id: string | null;
  signal_id: string | null;
  body: string;
  source_ref_type: string | null;
  source_ref_id: string | null;
  delta: number | null;
  recorded_at: number;
  origin: string;
  confidence: number | null;
  created_at: number;
}

const FULL =
  "id, goal_id, milestone_id, signal_id, body, source_ref_type, source_ref_id, " +
  "delta, recorded_at, origin, confidence, created_at";

const rowToEvidence = (row: EvidenceRow): GoalEvidence => ({
  id: row.id,
  goalId: row.goal_id,
  milestoneId: row.milestone_id,
  signalId: row.signal_id,
  body: row.body,
  sourceRefType: (row.source_ref_type as GoalEvidenceSourceRefType | null) ?? null,
  sourceRefId: row.source_ref_id,
  delta: row.delta,
  recordedAt: row.recorded_at,
  origin: row.origin as GoalEvidenceOrigin,
  confidence: row.confidence,
  createdAt: row.created_at,
});

export interface GoalEvidenceListFilter {
  goalId?: string;
  milestoneId?: string;
  signalId?: string;
  origin?: GoalEvidenceOrigin | "all";
  /** Inclusive lower bound on recorded_at. */
  recordedAfter?: number;
  /** Exclusive upper bound on recorded_at. */
  recordedBefore?: number;
  limit?: number;
}

export class GoalEvidenceRepository {
  constructor(private readonly db: Database) {}

  create(e: NewGoalEvidence): GoalEvidence {
    const id = newId();
    const ts = now();
    const recordedAt = e.recordedAt ?? ts;
    this.db
      .prepare(
        `INSERT INTO goal_evidence(${FULL}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        e.goalId,
        e.milestoneId ?? null,
        e.signalId ?? null,
        e.body,
        e.sourceRefType ?? null,
        e.sourceRefId ?? null,
        e.delta ?? null,
        recordedAt,
        e.origin ?? "manual",
        e.confidence ?? null,
        ts,
      );
    return {
      id,
      goalId: e.goalId,
      milestoneId: e.milestoneId ?? null,
      signalId: e.signalId ?? null,
      body: e.body,
      sourceRefType: e.sourceRefType ?? null,
      sourceRefId: e.sourceRefId ?? null,
      delta: e.delta ?? null,
      recordedAt,
      origin: (e.origin ?? "manual") as GoalEvidenceOrigin,
      confidence: e.confidence ?? null,
      createdAt: ts,
    };
  }

  get(id: string): GoalEvidence | undefined {
    const row = this.db
      .prepare(`SELECT ${FULL} FROM goal_evidence WHERE id = ?`)
      .get(id) as EvidenceRow | undefined;
    return row ? rowToEvidence(row) : undefined;
  }

  list(filter: GoalEvidenceListFilter = {}): GoalEvidence[] {
    const limit = filter.limit ?? 100;
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.goalId) {
      conditions.push("goal_id = ?");
      params.push(filter.goalId);
    }
    if (filter.milestoneId) {
      conditions.push("milestone_id = ?");
      params.push(filter.milestoneId);
    }
    if (filter.signalId) {
      conditions.push("signal_id = ?");
      params.push(filter.signalId);
    }
    if (filter.origin && filter.origin !== "all") {
      conditions.push("origin = ?");
      params.push(filter.origin);
    }
    if (filter.recordedAfter !== undefined) {
      conditions.push("recorded_at >= ?");
      params.push(filter.recordedAfter);
    }
    if (filter.recordedBefore !== undefined) {
      conditions.push("recorded_at < ?");
      params.push(filter.recordedBefore);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit);
    const rows = this.db
      .prepare(
        `SELECT ${FULL} FROM goal_evidence ${where}
         ORDER BY recorded_at DESC LIMIT ?`,
      )
      .all(...params) as EvidenceRow[];
    return rows.map(rowToEvidence);
  }

  /** Most recent evidence timestamp for a goal, or null if it has none. */
  latestRecordedAt(goalId: string): number | null {
    const row = this.db
      .prepare(
        "SELECT MAX(recorded_at) AS latest FROM goal_evidence WHERE goal_id = ?",
      )
      .get(goalId) as { latest: number | null };
    return row.latest ?? null;
  }

  /** Latest evidence row per goal in bulk — used by the briefing endpoint. */
  latestByGoals(goalIds: string[]): Map<string, GoalEvidence> {
    if (goalIds.length === 0) return new Map();
    const placeholders = goalIds.map(() => "?").join(",");
    const rows = this.db
      .prepare(
        `SELECT ${FULL} FROM goal_evidence
         WHERE id IN (
           SELECT id FROM (
             SELECT id, goal_id,
                    ROW_NUMBER() OVER (PARTITION BY goal_id ORDER BY recorded_at DESC) AS rn
             FROM goal_evidence
             WHERE goal_id IN (${placeholders})
           ) ranked
           WHERE rn = 1
         )`,
      )
      .all(...goalIds) as EvidenceRow[];
    const out = new Map<string, GoalEvidence>();
    for (const row of rows) out.set(row.goal_id, rowToEvidence(row));
    return out;
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM goal_evidence WHERE id = ?").run(id);
  }
}
