import type { Database } from "better-sqlite3";
import type {
  Milestone,
  MilestoneOrigin,
  MilestoneStatus,
  NewMilestone,
} from "@lifecoach/schemas";
import { newId, now } from "../../util/ids.js";

interface MilestoneRow {
  id: string;
  goal_id: string;
  title: string;
  body: string | null;
  status: string;
  order_index: number;
  due_at: number | null;
  completed_at: number | null;
  origin: string;
  confidence: number | null;
  created_at: number;
  updated_at: number;
}

const FULL =
  "id, goal_id, title, body, status, order_index, due_at, completed_at, " +
  "origin, confidence, created_at, updated_at";

const rowToMilestone = (row: MilestoneRow): Milestone => ({
  id: row.id,
  goalId: row.goal_id,
  title: row.title,
  body: row.body,
  status: row.status as MilestoneStatus,
  orderIndex: row.order_index,
  dueAt: row.due_at,
  completedAt: row.completed_at,
  origin: row.origin as MilestoneOrigin,
  confidence: row.confidence,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export interface MilestoneListFilter {
  goalId?: string;
  status?: MilestoneStatus | "all";
  limit?: number;
}

export class MilestoneRepository {
  constructor(private readonly db: Database) {}

  create(m: NewMilestone): Milestone {
    // If no orderIndex provided, place this milestone at the end of the goal's
    // existing list — common case when the agent adds one at the user's request.
    const orderIndex =
      m.orderIndex ?? this.nextOrderIndexFor(m.goalId);
    const id = newId();
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO milestones(${FULL}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        m.goalId,
        m.title,
        m.body ?? null,
        m.status ?? "pending",
        orderIndex,
        m.dueAt ?? null,
        null,
        m.origin ?? "manual",
        m.confidence ?? null,
        ts,
        ts,
      );
    return {
      id,
      goalId: m.goalId,
      title: m.title,
      body: m.body ?? null,
      status: (m.status ?? "pending") as MilestoneStatus,
      orderIndex,
      dueAt: m.dueAt ?? null,
      completedAt: null,
      origin: (m.origin ?? "manual") as MilestoneOrigin,
      confidence: m.confidence ?? null,
      createdAt: ts,
      updatedAt: ts,
    };
  }

  get(id: string): Milestone | undefined {
    const row = this.db
      .prepare(`SELECT ${FULL} FROM milestones WHERE id = ?`)
      .get(id) as MilestoneRow | undefined;
    return row ? rowToMilestone(row) : undefined;
  }

  list(filter: MilestoneListFilter = {}): Milestone[] {
    const limit = filter.limit ?? 200;
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.goalId) {
      conditions.push("goal_id = ?");
      params.push(filter.goalId);
    }
    if (filter.status && filter.status !== "all") {
      conditions.push("status = ?");
      params.push(filter.status);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit);
    const rows = this.db
      .prepare(
        `SELECT ${FULL} FROM milestones ${where}
         ORDER BY order_index ASC, created_at ASC LIMIT ?`,
      )
      .all(...params) as MilestoneRow[];
    return rows.map(rowToMilestone);
  }

  /** Patch updatable fields. completed_at is set automatically on the
   *  pending/active → done transition (never reverted). */
  update(
    id: string,
    patch: {
      title?: string;
      body?: string | null;
      status?: MilestoneStatus;
      orderIndex?: number;
      dueAt?: number | null;
    },
  ): Milestone | undefined {
    const existing = this.get(id);
    if (!existing) return undefined;
    const ts = now();
    const status = patch.status ?? existing.status;
    const completedAt =
      status === "done" && existing.status !== "done" ? ts : existing.completedAt;
    this.db
      .prepare(
        `UPDATE milestones SET
           title = ?, body = ?, status = ?, order_index = ?, due_at = ?,
           completed_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        patch.title ?? existing.title,
        patch.body === undefined ? existing.body : patch.body,
        status,
        patch.orderIndex ?? existing.orderIndex,
        patch.dueAt === undefined ? existing.dueAt : patch.dueAt,
        completedAt ?? null,
        ts,
        id,
      );
    return this.get(id);
  }

  /** Convenience: set status='done'. completed_at is stamped by update(). */
  complete(id: string): Milestone | undefined {
    return this.update(id, { status: "done" });
  }

  /** Reorder by replacing each milestone's order_index in a single transaction.
   *  Accepts the milestone ids in their new desired order. */
  reorder(goalId: string, idsInOrder: string[]): void {
    const upd = this.db.prepare(
      "UPDATE milestones SET order_index = ?, updated_at = ? WHERE id = ? AND goal_id = ?",
    );
    const ts = now();
    this.db.transaction(() => {
      idsInOrder.forEach((id, idx) => {
        upd.run(idx, ts, id, goalId);
      });
    })();
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM milestones WHERE id = ?").run(id);
  }

  countByGoal(goalId: string): { total: number; done: number } {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done
         FROM milestones WHERE goal_id = ?`,
      )
      .get(goalId) as { total: number; done: number | null };
    return { total: row.total, done: row.done ?? 0 };
  }

  /** Internal helper to default a new milestone to end-of-list. */
  private nextOrderIndexFor(goalId: string): number {
    const row = this.db
      .prepare("SELECT MAX(order_index) AS max_idx FROM milestones WHERE goal_id = ?")
      .get(goalId) as { max_idx: number | null };
    return row.max_idx === null ? 0 : row.max_idx + 1;
  }
}
