import type { Database } from "better-sqlite3";
import { newId, now } from "../../util/ids.js";

export type JobRunStatus = "running" | "success" | "failed" | "skipped";

export interface JobGeneratedRef {
  refType: string;
  refId: string;
}

export interface JobRun {
  id: string;
  name: string;
  status: JobRunStatus;
  startedAt: number;
  finishedAt: number | null;
  durationMs: number | null;
  errorSummary: string | null;
  generatedRefs: JobGeneratedRef[];
}

export type JobRunResult<T> =
  | { status: "ran"; run: JobRun; result: T }
  | { status: "skipped"; reason: "already_running"; activeRunId: string };

interface JobRunRow {
  id: string;
  name: string;
  status: string;
  started_at: number;
  finished_at: number | null;
  duration_ms: number | null;
  error_summary: string | null;
  generated_refs: string;
}

interface JobLockRow {
  name: string;
  run_id: string;
  locked_at: number;
}

const FULL =
  "id, name, status, started_at, finished_at, duration_ms, error_summary, generated_refs";

const DEFAULT_STALE_AFTER_MS = 6 * 60 * 60 * 1000;

const parseGeneratedRefs = (raw: string): JobGeneratedRef[] => {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((ref): ref is JobGeneratedRef => {
    if (!ref || typeof ref !== "object") return false;
    const maybe = ref as Partial<JobGeneratedRef>;
    return typeof maybe.refType === "string" && typeof maybe.refId === "string";
  });
};

const rowToJobRun = (row: JobRunRow): JobRun => ({
  id: row.id,
  name: row.name,
  status: row.status as JobRunStatus,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  durationMs: row.duration_ms,
  errorSummary: row.error_summary,
  generatedRefs: parseGeneratedRefs(row.generated_refs),
});

const summarizeError = (err: unknown): string => {
  const message = err instanceof Error ? err.message : String(err);
  return message.length > 1000 ? message.slice(0, 997) + "..." : message;
};

export class JobRepository {
  constructor(private readonly db: Database) {}

  start(name: string, opts: { staleAfterMs?: number } = {}): JobRun | null {
    const staleAfterMs = opts.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
    const tx = this.db.transaction(() => {
      const ts = now();
      const lock = this.db
        .prepare("SELECT name, run_id, locked_at FROM job_locks WHERE name = ?")
        .get(name) as JobLockRow | undefined;
      if (lock && ts - lock.locked_at <= staleAfterMs) {
        return null;
      }
      if (lock) {
        this.db.prepare("DELETE FROM job_locks WHERE name = ?").run(name);
        this.db
          .prepare(
            `UPDATE job_runs SET status = 'failed', finished_at = ?, duration_ms = ?,
               error_summary = COALESCE(error_summary, 'stale lock reclaimed')
             WHERE id = ? AND status = 'running'`,
          )
          .run(ts, ts - lock.locked_at, lock.run_id);
      }

      const id = newId();
      this.db
        .prepare(
          `INSERT INTO job_runs(${FULL})
           VALUES (?, ?, 'running', ?, NULL, NULL, NULL, '[]')`,
        )
        .run(id, name, ts);
      this.db
        .prepare("INSERT INTO job_locks(name, run_id, locked_at) VALUES (?, ?, ?)")
        .run(name, id, ts);
      return this.get(id)!;
    });
    return tx() as JobRun | null;
  }

  finish(id: string, generatedRefs: JobGeneratedRef[] = []): JobRun {
    const existing = this.get(id);
    if (!existing) throw new Error(`No job run with id ${id}`);
    const finishedAt = now();
    this.db
      .prepare(
        `UPDATE job_runs SET status = 'success', finished_at = ?, duration_ms = ?,
           generated_refs = ?
         WHERE id = ?`,
      )
      .run(finishedAt, finishedAt - existing.startedAt, JSON.stringify(generatedRefs), id);
    this.db.prepare("DELETE FROM job_locks WHERE run_id = ?").run(id);
    return this.get(id)!;
  }

  fail(id: string, err: unknown, generatedRefs: JobGeneratedRef[] = []): JobRun {
    const existing = this.get(id);
    if (!existing) throw new Error(`No job run with id ${id}`);
    const finishedAt = now();
    this.db
      .prepare(
        `UPDATE job_runs SET status = 'failed', finished_at = ?, duration_ms = ?,
           error_summary = ?, generated_refs = ?
         WHERE id = ?`,
      )
      .run(
        finishedAt,
        finishedAt - existing.startedAt,
        summarizeError(err),
        JSON.stringify(generatedRefs),
        id,
      );
    this.db.prepare("DELETE FROM job_locks WHERE run_id = ?").run(id);
    return this.get(id)!;
  }

  async run<T>(
    name: string,
    fn: (run: JobRun) => Promise<T>,
    opts: {
      staleAfterMs?: number;
      generatedRefs?: (result: T) => JobGeneratedRef[];
    } = {},
  ): Promise<JobRunResult<T>> {
    const run = this.start(name, { ...(opts.staleAfterMs !== undefined ? { staleAfterMs: opts.staleAfterMs } : {}) });
    if (!run) {
      const active = this.db
        .prepare("SELECT run_id FROM job_locks WHERE name = ?")
        .get(name) as { run_id: string } | undefined;
      return {
        status: "skipped",
        reason: "already_running",
        activeRunId: active?.run_id ?? "unknown",
      };
    }

    try {
      const result = await fn(run);
      const finished = this.finish(run.id, opts.generatedRefs?.(result) ?? []);
      return { status: "ran", run: finished, result };
    } catch (err) {
      this.fail(run.id, err);
      throw err;
    }
  }

  get(id: string): JobRun | undefined {
    const row = this.db
      .prepare(`SELECT ${FULL} FROM job_runs WHERE id = ?`)
      .get(id) as JobRunRow | undefined;
    return row ? rowToJobRun(row) : undefined;
  }

  recent(name: string, limit = 20): JobRun[] {
    const rows = this.db
      .prepare(
        `SELECT ${FULL} FROM job_runs
         WHERE name = ?
         ORDER BY started_at DESC
         LIMIT ?`,
      )
      .all(name, limit) as JobRunRow[];
    return rows.map(rowToJobRun);
  }
}
