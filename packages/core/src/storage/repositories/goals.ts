import type { Database } from "better-sqlite3";
import type { Goal, GoalHorizon, GoalStatus, NewGoal } from "@lifecoach/schemas";
import { newId, now } from "../../util/ids.js";

interface GoalRow {
  id: string;
  title: string;
  body: string | null;
  horizon: string;
  status: string;
  success_criteria: string | null;
  parent_goal_id: string | null;
  project_id: string | null;
  target_metric: string | null;
  target_value: number | null;
  current_progress: number | null;
  due_at: number | null;
  completed_at: number | null;
  created_at: number;
  updated_at: number;
}

const FULL =
  "id, title, body, horizon, status, success_criteria, parent_goal_id, project_id, " +
  "target_metric, target_value, current_progress, due_at, completed_at, created_at, updated_at";

const rowToGoal = (row: GoalRow): Goal => ({
  id: row.id,
  title: row.title,
  body: row.body,
  horizon: row.horizon as GoalHorizon,
  status: row.status as GoalStatus,
  successCriteria: row.success_criteria,
  parentGoalId: row.parent_goal_id,
  projectId: row.project_id,
  targetMetric: row.target_metric,
  targetValue: row.target_value,
  currentProgress: row.current_progress,
  dueAt: row.due_at,
  completedAt: row.completed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export interface GoalListFilter {
  status?: GoalStatus | "all";
  horizon?: GoalHorizon | "all";
  projectId?: string;
  limit?: number;
}

export class GoalRepository {
  constructor(private readonly db: Database) {}

  create(g: NewGoal): Goal {
    const id = newId();
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO goals(${FULL}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        g.title,
        g.body ?? null,
        g.horizon ?? "open",
        g.status ?? "active",
        g.successCriteria ?? null,
        g.parentGoalId ?? null,
        g.projectId ?? null,
        g.targetMetric ?? null,
        g.targetValue ?? null,
        g.currentProgress ?? null,
        g.dueAt ?? null,
        null,
        ts,
        ts,
      );
    return {
      id,
      title: g.title,
      body: g.body ?? null,
      horizon: (g.horizon ?? "open") as GoalHorizon,
      status: (g.status ?? "active") as GoalStatus,
      successCriteria: g.successCriteria ?? null,
      parentGoalId: g.parentGoalId ?? null,
      projectId: g.projectId ?? null,
      targetMetric: g.targetMetric ?? null,
      targetValue: g.targetValue ?? null,
      currentProgress: g.currentProgress ?? null,
      dueAt: g.dueAt ?? null,
      completedAt: null,
      createdAt: ts,
      updatedAt: ts,
    };
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
    if (filter.projectId) {
      conditions.push("project_id = ?");
      params.push(filter.projectId);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit);
    const rows = this.db
      .prepare(
        `SELECT ${FULL} FROM goals ${where}
         ORDER BY (status = 'active') DESC,
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
    const existing = this.get(id);
    if (!existing) return undefined;
    const ts = now();
    const status = patch.status ?? existing.status;
    const completedAt =
      status === "done" && existing.status !== "done" ? ts : existing.completedAt;
    this.db
      .prepare(
        `UPDATE goals SET
           current_progress = ?, status = ?, body = ?, success_criteria = ?,
           target_value = ?, completed_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        patch.currentProgress ?? existing.currentProgress ?? null,
        status,
        patch.body ?? existing.body ?? null,
        patch.successCriteria ?? existing.successCriteria ?? null,
        patch.targetValue ?? existing.targetValue ?? null,
        completedAt ?? null,
        ts,
        id,
      );
    return this.get(id);
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM goals WHERE id = ?").run(id);
  }

  count(filter: GoalListFilter = {}): number {
    return this.list({ ...filter, limit: 1_000_000 }).length;
  }
}
