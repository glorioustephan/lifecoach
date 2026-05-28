import type { Database } from "better-sqlite3";
import type { NewProject, Project, ProjectStatus } from "@lifecoach/schemas";
import { newId, now } from "../../util/ids.js";

interface ProjectRow {
  id: string;
  title: string;
  body: string | null;
  status: string;
  target_date: number | null;
  started_at: number;
  ended_at: number | null;
  created_at: number;
  updated_at: number;
}

const FULL =
  "id, title, body, status, target_date, started_at, ended_at, created_at, updated_at";

const rowToProject = (row: ProjectRow): Project => ({
  id: row.id,
  title: row.title,
  body: row.body,
  status: row.status as ProjectStatus,
  targetDate: row.target_date,
  startedAt: row.started_at,
  endedAt: row.ended_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export interface ProjectListFilter {
  status?: ProjectStatus | "all";
  limit?: number;
}

export class ProjectRepository {
  constructor(private readonly db: Database) {}

  create(p: NewProject): Project {
    const id = newId();
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO projects(${FULL}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        p.title,
        p.body ?? null,
        p.status ?? "active",
        p.targetDate ?? null,
        ts,
        null,
        ts,
        ts,
      );
    return {
      id,
      title: p.title,
      body: p.body ?? null,
      status: (p.status ?? "active") as ProjectStatus,
      targetDate: p.targetDate ?? null,
      startedAt: ts,
      endedAt: null,
      createdAt: ts,
      updatedAt: ts,
    };
  }

  get(id: string): Project | undefined {
    const row = this.db
      .prepare(`SELECT ${FULL} FROM projects WHERE id = ?`)
      .get(id) as ProjectRow | undefined;
    return row ? rowToProject(row) : undefined;
  }

  list(filter: ProjectListFilter = {}): Project[] {
    const limit = filter.limit ?? 100;
    const where = filter.status && filter.status !== "all" ? "WHERE status = ?" : "";
    const params: unknown[] = [];
    if (filter.status && filter.status !== "all") params.push(filter.status);
    params.push(limit);
    const rows = this.db
      .prepare(
        `SELECT ${FULL} FROM projects ${where}
         ORDER BY (status = 'active') DESC, started_at DESC LIMIT ?`,
      )
      .all(...params) as ProjectRow[];
    return rows.map(rowToProject);
  }

  updateStatus(id: string, status: ProjectStatus): void {
    const ts = now();
    const endedAt = status === "done" || status === "abandoned" ? ts : null;
    this.db
      .prepare(
        `UPDATE projects SET status = ?, ended_at = ?, updated_at = ? WHERE id = ?`,
      )
      .run(status, endedAt, ts, id);
  }

  count(filter: ProjectListFilter = {}): number {
    return this.list({ ...filter, limit: 1_000_000 }).length;
  }

  /**
   * Find a project whose body contains the given substring. Used by the
   * Capacities type-router as a low-impact keyless idempotency check (a
   * `[capacities:<id>]` sentinel embedded in the body avoids a schema
   * change just to thread an external_id column for the integration).
   */
  findByBodyContains(needle: string): Project | undefined {
    const row = this.db
      .prepare(`SELECT ${FULL} FROM projects WHERE body LIKE ? LIMIT 1`)
      .get(`%${needle}%`) as ProjectRow | undefined;
    return row ? rowToProject(row) : undefined;
  }

  /** Patch project title and body. Updates `updated_at` automatically. */
  updateContent(id: string, patch: { title?: string; body?: string }): void {
    const sets: string[] = [];
    const args: unknown[] = [];
    if (patch.title !== undefined) {
      sets.push("title = ?");
      args.push(patch.title);
    }
    if (patch.body !== undefined) {
      sets.push("body = ?");
      args.push(patch.body);
    }
    if (sets.length === 0) return;
    sets.push("updated_at = ?");
    args.push(now());
    args.push(id);
    this.db.prepare(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`).run(...args);
  }
}
