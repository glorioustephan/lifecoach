import type { Database } from "better-sqlite3";
import type { Session } from "@lifecoach/schemas";
import { newId, now } from "../../util/ids.js";

interface SessionRow {
  id: string;
  started_at: number;
  ended_at: number | null;
  summary: string | null;
  archived_at: number | null;
}

const rowToSession = (row: SessionRow): Session => ({
  id: row.id,
  startedAt: row.started_at,
  endedAt: row.ended_at,
  summary: row.summary,
  archivedAt: row.archived_at,
});

export class SessionRepository {
  constructor(private readonly db: Database) {}

  create(): Session {
    const id = newId();
    const startedAt = now();
    this.db
      .prepare("INSERT INTO sessions(id, started_at) VALUES (?, ?)")
      .run(id, startedAt);
    return { id, startedAt, endedAt: null, summary: null };
  }

  end(id: string, summary?: string): void {
    this.db
      .prepare("UPDATE sessions SET ended_at = ?, summary = ? WHERE id = ?")
      .run(now(), summary ?? null, id);
  }

  get(id: string): Session | undefined {
    const row = this.db
      .prepare(
        "SELECT id, started_at, ended_at, summary, archived_at FROM sessions WHERE id = ?"
      )
      .get(id) as SessionRow | undefined;
    return row ? rowToSession(row) : undefined;
  }

  recent(limit = 20, includeArchived = false): Session[] {
    const whereClause = includeArchived ? "" : "WHERE archived_at IS NULL";
    const rows = this.db
      .prepare(
        `SELECT id, started_at, ended_at, summary, archived_at FROM sessions ${whereClause} ORDER BY started_at DESC LIMIT ?`
      )
      .all(limit) as SessionRow[];
    return rows.map(rowToSession);
  }

  archived(limit = 20): Session[] {
    const rows = this.db
      .prepare(
        "SELECT id, started_at, ended_at, summary, archived_at FROM sessions WHERE archived_at IS NOT NULL ORDER BY archived_at DESC LIMIT ?"
      )
      .all(limit) as SessionRow[];
    return rows.map(rowToSession);
  }

  archive(id: string): void {
    this.db
      .prepare("UPDATE sessions SET archived_at = ? WHERE id = ?")
      .run(now(), id);
  }

  unarchive(id: string): void {
    this.db
      .prepare("UPDATE sessions SET archived_at = NULL WHERE id = ?")
      .run(id);
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) as c FROM sessions").get() as {
      c: number;
    };
    return row.c;
  }
}
