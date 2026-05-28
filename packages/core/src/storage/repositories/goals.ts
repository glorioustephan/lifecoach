import type { Database } from "better-sqlite3";
import type {
  Goal,
  GoalCadence,
  GoalHorizon,
  GoalKind,
  GoalReviewCadence,
  GoalStatus,
  NewGoal,
} from "@lifecoach/schemas";
import { newId, now } from "../../util/ids.js";

interface GoalRow {
  id: string;
  title: string;
  body: string | null;
  horizon: string;
  status: string;
  kind: string;
  cadence: string | null;
  outcome: string | null;
  obstacle: string | null;
  implementation_intention: string | null;
  identity_statement: string | null;
  success_criteria: string | null;
  parent_goal_id: string | null;
  project_id: string | null;
  target_metric: string | null;
  target_value: number | null;
  current_progress: number | null;
  review_cadence: string;
  last_reviewed_at: number | null;
  archived_at: number | null;
  due_at: number | null;
  completed_at: number | null;
  created_at: number;
  updated_at: number;
}

const FULL =
  "id, title, body, horizon, status, kind, cadence, outcome, obstacle, " +
  "implementation_intention, identity_statement, success_criteria, " +
  "parent_goal_id, project_id, target_metric, target_value, current_progress, " +
  "review_cadence, last_reviewed_at, archived_at, due_at, completed_at, " +
  "created_at, updated_at";

const rowToGoal = (row: GoalRow): Goal => ({
  id: row.id,
  title: row.title,
  body: row.body,
  horizon: row.horizon as GoalHorizon,
  status: row.status as GoalStatus,
  kind: row.kind as GoalKind,
  cadence: (row.cadence as GoalCadence | null) ?? null,
  outcome: row.outcome,
  obstacle: row.obstacle,
  implementationIntention: row.implementation_intention,
  identityStatement: row.identity_statement,
  successCriteria: row.success_criteria,
  parentGoalId: row.parent_goal_id,
  projectId: row.project_id,
  targetMetric: row.target_metric,
  targetValue: row.target_value,
  currentProgress: row.current_progress,
  reviewCadence: row.review_cadence as GoalReviewCadence,
  lastReviewedAt: row.last_reviewed_at,
  archivedAt: row.archived_at,
  dueAt: row.due_at,
  completedAt: row.completed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export interface GoalListFilter {
  status?: GoalStatus | "all";
  horizon?: GoalHorizon | "all";
  kind?: GoalKind | "all";
  projectId?: string;
  /** When false, archived goals are excluded (the default for UI surfaces). */
  includeArchived?: boolean;
  limit?: number;
}

export class GoalRepository {
  constructor(private readonly db: Database) {}

  create(g: NewGoal): Goal {
    const id = newId();
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO goals(${FULL}) VALUES (
           ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         )`,
      )
      .run(
        id,
        g.title,
        g.body ?? null,
        g.horizon ?? "open",
        g.status ?? "active",
        g.kind ?? "outcome",
        g.cadence ?? null,
        g.outcome ?? null,
        g.obstacle ?? null,
        g.implementationIntention ?? null,
        g.identityStatement ?? null,
        g.successCriteria ?? null,
        g.parentGoalId ?? null,
        g.projectId ?? null,
        g.targetMetric ?? null,
        g.targetValue ?? null,
        g.currentProgress ?? null,
        g.reviewCadence ?? "weekly",
        null, // last_reviewed_at — set on first agent/user review
        null, // archived_at
        g.dueAt ?? null,
        null, // completed_at
        ts,
        ts,
      );
    return this.get(id) as Goal;
  }

  get(id: string): Goal | undefined {
    const row = this.db
      .prepare(`SELECT ${FULL} FROM goals WHERE id = ?`)
      .get(id) as GoalRow | undefined;
    return row ? rowToGoal(row) : undefined;
  }

  list(filter: GoalListFilter = {}): Goal[] {
    const limit = filter.limit ?? 100;
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.status && filter.status !== "all") {
      conditions.push("status = ?");
      params.push(filter.status);
    }
    if (filter.horizon && filter.horizon !== "all") {
      conditions.push("horizon = ?");
      params.push(filter.horizon);
    }
    if (filter.kind && filter.kind !== "all") {
      conditions.push("kind = ?");
      params.push(filter.kind);
    }
    if (filter.projectId) {
      conditions.push("project_id = ?");
      params.push(filter.projectId);
    }
    if (!filter.includeArchived) {
      conditions.push("archived_at IS NULL");
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit);
    // Ordering rationale:
    //  - active before everything else
    //  - within active: stalest review first (so the user reviews them next),
    //    then by horizon priority (week → month → quarter → year → open)
    //    for ties, then by due_at and created_at.
    const rows = this.db
      .prepare(
        `SELECT ${FULL} FROM goals ${where}
         ORDER BY (status = 'active') DESC,
                  COALESCE(last_reviewed_at, 0) ASC,
                  (horizon = 'this-week') DESC,
                  (horizon = 'this-month') DESC,
                  (horizon = 'this-quarter') DESC,
                  (horizon = 'this-year') DESC,
                  due_at ASC,
                  created_at DESC
         LIMIT ?`,
      )
      .all(...params) as GoalRow[];
    return rows.map(rowToGoal);
  }

  /** Patch any writable field. Goes through here for both UI and agent edits so
   *  hook points (e.g. re-index) stay in one spot. */
  update(
    id: string,
    patch: Partial<
      Pick<
        Goal,
        | "title"
        | "body"
        | "horizon"
        | "status"
        | "kind"
        | "cadence"
        | "outcome"
        | "obstacle"
        | "implementationIntention"
        | "identityStatement"
        | "successCriteria"
        | "parentGoalId"
        | "projectId"
        | "targetMetric"
        | "targetValue"
        | "currentProgress"
        | "reviewCadence"
        | "lastReviewedAt"
        | "archivedAt"
        | "dueAt"
      >
    >,
  ): Goal | undefined {
    const existing = this.get(id);
    if (!existing) return undefined;
    const ts = now();
    const status = patch.status ?? existing.status;
    const completedAt =
      status === "done" && existing.status !== "done" ? ts : existing.completedAt;
    // For each field, `undefined` means "leave alone"; an explicit `null` from
    // the caller clears it.
    const pick = <K extends keyof typeof patch>(
      key: K,
      fallback: Goal[K extends keyof Goal ? K : never],
    ): unknown => (patch[key] === undefined ? fallback : patch[key]);
    this.db
      .prepare(
        `UPDATE goals SET
           title = ?, body = ?, horizon = ?, status = ?, kind = ?, cadence = ?,
           outcome = ?, obstacle = ?, implementation_intention = ?,
           identity_statement = ?, success_criteria = ?, parent_goal_id = ?,
           project_id = ?, target_metric = ?, target_value = ?,
           current_progress = ?, review_cadence = ?, last_reviewed_at = ?,
           archived_at = ?, due_at = ?, completed_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        pick("title", existing.title),
        pick("body", existing.body ?? null),
        pick("horizon", existing.horizon),
        status,
        pick("kind", existing.kind),
        pick("cadence", existing.cadence ?? null),
        pick("outcome", existing.outcome ?? null),
        pick("obstacle", existing.obstacle ?? null),
        pick("implementationIntention", existing.implementationIntention ?? null),
        pick("identityStatement", existing.identityStatement ?? null),
        pick("successCriteria", existing.successCriteria ?? null),
        pick("parentGoalId", existing.parentGoalId ?? null),
        pick("projectId", existing.projectId ?? null),
        pick("targetMetric", existing.targetMetric ?? null),
        pick("targetValue", existing.targetValue ?? null),
        pick("currentProgress", existing.currentProgress ?? null),
        pick("reviewCadence", existing.reviewCadence),
        pick("lastReviewedAt", existing.lastReviewedAt ?? null),
        pick("archivedAt", existing.archivedAt ?? null),
        pick("dueAt", existing.dueAt ?? null),
        completedAt ?? null,
        ts,
        id,
      );
    return this.get(id);
  }

  /** Back-compat alias for the legacy 5-field patch (used by old agent
   *  tooling and the existing PATCH /api/goals/:id route). */
  updateProgress(
    id: string,
    patch: {
      currentProgress?: number;
      status?: GoalStatus;
      body?: string;
      successCriteria?: string;
      targetValue?: number;
    },
  ): Goal | undefined {
    return this.update(id, patch);
  }

  /** Stamp last_reviewed_at — called by the review cron and by explicit user
   *  "I've thought about this" actions. */
  markReviewed(id: string): Goal | undefined {
    return this.update(id, { lastReviewedAt: now() });
  }

  /** Soft archive — keeps the row + its embeddings + linked tasks intact. */
  archive(id: string): Goal | undefined {
    return this.update(id, { archivedAt: now() });
  }

  unarchive(id: string): Goal | undefined {
    return this.update(id, { archivedAt: null });
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM goals WHERE id = ?").run(id);
  }

  count(filter: GoalListFilter = {}): number {
    return this.list({ ...filter, limit: 1_000_000 }).length;
  }
}
