import type { Database } from "better-sqlite3";
import type { NewTask, Task, TaskPriority } from "@lifecoach/schemas";
import { newId, now } from "../../util/ids.js";

interface TaskRow {
  id: string;
  external_id: string | null;
  external_source: string | null;
  content: string;
  description: string | null;
  project_id: string | null;
  project_name: string | null;
  labels: string;
  priority: number | null;
  due_at: number | null;
  due_string: string | null;
  completed_at: number | null;
  url: string | null;
  created_at: number;
  updated_at: number;
  synced_at: number;
}

const rowToTask = (row: TaskRow): Task => ({
  id: row.id,
  externalId: row.external_id,
  externalSource: row.external_source,
  content: row.content,
  description: row.description,
  projectId: row.project_id,
  projectName: row.project_name,
  labels: JSON.parse(row.labels) as string[],
  priority: (row.priority as TaskPriority | null) ?? null,
  dueAt: row.due_at,
  dueString: row.due_string,
  completedAt: row.completed_at,
  url: row.url,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  syncedAt: row.synced_at,
});

const FULL_COLUMNS =
  "id, external_id, external_source, content, description, project_id, project_name, labels, priority, due_at, due_string, completed_at, url, created_at, updated_at, synced_at";

export interface TaskListFilter {
  status?: "active" | "completed" | "overdue" | "all";
  dueBefore?: number;
  dueAfter?: number;
  projectId?: string;
  externalSource?: string;
  limit?: number;
  offset?: number;
}

export class TaskRepository {
  constructor(private readonly db: Database) {}

  get(id: string): Task | undefined {
    const row = this.db
      .prepare(`SELECT ${FULL_COLUMNS} FROM tasks WHERE id = ?`)
      .get(id) as TaskRow | undefined;
    return row ? rowToTask(row) : undefined;
  }

  getByExternal(source: string, externalId: string): Task | undefined {
    const row = this.db
      .prepare(
        `SELECT ${FULL_COLUMNS} FROM tasks WHERE external_source = ? AND external_id = ?`,
      )
      .get(source, externalId) as TaskRow | undefined;
    return row ? rowToTask(row) : undefined;
  }

  list(filter: TaskListFilter = {}): Task[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    switch (filter.status) {
      case "active":
        conditions.push("completed_at IS NULL");
        break;
      case "completed":
        conditions.push("completed_at IS NOT NULL");
        break;
      case "overdue":
        conditions.push("completed_at IS NULL AND due_at IS NOT NULL AND due_at < ?");
        params.push(now());
        break;
      case "all":
      default:
        break;
    }
    if (filter.dueBefore !== undefined) {
      conditions.push("due_at < ?");
      params.push(filter.dueBefore);
    }
    if (filter.dueAfter !== undefined) {
      conditions.push("due_at >= ?");
      params.push(filter.dueAfter);
    }
    if (filter.projectId) {
      conditions.push("project_id = ?");
      params.push(filter.projectId);
    }
    if (filter.externalSource) {
      conditions.push("external_source = ?");
      params.push(filter.externalSource);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filter.limit ?? 200;
    const offset = filter.offset ?? 0;
    const sql = `SELECT ${FULL_COLUMNS} FROM tasks ${where}
                 ORDER BY (due_at IS NULL), due_at ASC, priority DESC NULLS LAST, created_at DESC
                 LIMIT ? OFFSET ?`;
    const rows = this.db.prepare(sql).all(...params, limit, offset) as TaskRow[];
    return rows.map(rowToTask);
  }

  count(filter: Omit<TaskListFilter, "limit" | "offset"> = {}): number {
    const conditions: string[] = [];
    const params: unknown[] = [];

    switch (filter.status) {
      case "active":
        conditions.push("completed_at IS NULL");
        break;
      case "completed":
        conditions.push("completed_at IS NOT NULL");
        break;
      case "overdue":
        conditions.push("completed_at IS NULL AND due_at IS NOT NULL AND due_at < ?");
        params.push(now());
        break;
      case "all":
      default:
        break;
    }
    if (filter.dueBefore !== undefined) {
      conditions.push("due_at < ?");
      params.push(filter.dueBefore);
    }
    if (filter.dueAfter !== undefined) {
      conditions.push("due_at >= ?");
      params.push(filter.dueAfter);
    }
    if (filter.projectId) {
      conditions.push("project_id = ?");
      params.push(filter.projectId);
    }
    if (filter.externalSource) {
      conditions.push("external_source = ?");
      params.push(filter.externalSource);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `SELECT COUNT(*) as count FROM tasks ${where}`;
    const result = this.db.prepare(sql).get(...params) as { count: number } | undefined;
    return result?.count ?? 0;
  }

  /**
   * Upsert by (external_source, external_id). Used by the sync flow.
   * Local-only tasks (no external IDs) should use `create()` instead.
   */
  upsertByExternal(task: NewTask): Task {
    if (!task.externalSource || !task.externalId) {
      throw new Error("upsertByExternal requires externalSource + externalId");
    }
    const existing = this.getByExternal(task.externalSource, task.externalId);
    const ts = now();

    if (existing) {
      this.db
        .prepare(
          `UPDATE tasks SET
              content = ?, description = ?, project_id = ?, project_name = ?,
              labels = ?, priority = ?, due_at = ?, due_string = ?,
              completed_at = ?, url = ?, updated_at = ?, synced_at = ?
           WHERE id = ?`,
        )
        .run(
          task.content,
          task.description ?? null,
          task.projectId ?? null,
          task.projectName ?? null,
          JSON.stringify(task.labels ?? []),
          task.priority ?? null,
          task.dueAt ?? null,
          task.dueString ?? null,
          task.completedAt ?? null,
          task.url ?? null,
          ts,
          ts,
          existing.id,
        );
      return { ...existing, ...task, updatedAt: ts, syncedAt: ts };
    }

    const id = newId();
    this.db
      .prepare(
        `INSERT INTO tasks(${FULL_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        task.externalId,
        task.externalSource,
        task.content,
        task.description ?? null,
        task.projectId ?? null,
        task.projectName ?? null,
        JSON.stringify(task.labels ?? []),
        task.priority ?? null,
        task.dueAt ?? null,
        task.dueString ?? null,
        task.completedAt ?? null,
        task.url ?? null,
        ts,
        ts,
        ts,
      );
    return {
      id,
      externalId: task.externalId,
      externalSource: task.externalSource,
      content: task.content,
      description: task.description ?? null,
      projectId: task.projectId ?? null,
      projectName: task.projectName ?? null,
      labels: task.labels ?? [],
      priority: task.priority ?? null,
      dueAt: task.dueAt ?? null,
      dueString: task.dueString ?? null,
      completedAt: task.completedAt ?? null,
      url: task.url ?? null,
      createdAt: ts,
      updatedAt: ts,
      syncedAt: ts,
    };
  }

  /**
   * Mark all tasks for a given source as completed if they're not in the
   * provided set of still-active external IDs. Used after a full sync of
   * active tasks: anything in our DB that wasn't returned must have been
   * completed or deleted upstream.
   *
   * Returns the number of tasks newly marked completed.
   */
  reconcileActiveSet(source: string, activeExternalIds: Set<string>): number {
    const rows = this.db
      .prepare(
        "SELECT external_id FROM tasks WHERE external_source = ? AND completed_at IS NULL",
      )
      .all(source) as { external_id: string }[];

    let newlyCompleted = 0;
    const ts = now();
    for (const row of rows) {
      if (!activeExternalIds.has(row.external_id)) {
        this.db
          .prepare(
            "UPDATE tasks SET completed_at = ?, updated_at = ? WHERE external_source = ? AND external_id = ?",
          )
          .run(ts, ts, source, row.external_id);
        newlyCompleted += 1;
      }
    }
    return newlyCompleted;
  }

  completeTask(id: string): void {
    const ts = now();
    this.db
      .prepare("UPDATE tasks SET completed_at = ?, updated_at = ? WHERE id = ?")
      .run(ts, ts, id);
  }
}
