import type { Database } from "better-sqlite3";
import type { NewReflection, Reflection, ReflectionKind } from "@lifecoach/schemas";
import { newId, now } from "../../util/ids.js";
import { parseStringArray } from "../../util/json.js";

interface ReflectionRow {
  id: string;
  period_start: number;
  period_end: number;
  kind: string;
  title: string | null;
  themes: string;
  wins: string;
  concerns: string;
  open_threads: string;
  body: string;
  created_at: number;
}

const rowToReflection = (row: ReflectionRow): Reflection => ({
  id: row.id,
  periodStart: row.period_start,
  periodEnd: row.period_end,
  kind: row.kind as ReflectionKind,
  title: row.title ?? undefined,
  themes: parseStringArray(row.themes),
  wins: parseStringArray(row.wins),
  concerns: parseStringArray(row.concerns),
  openThreads: parseStringArray(row.open_threads),
  body: row.body,
  createdAt: row.created_at,
});

export class ReflectionRepository {
  constructor(private readonly db: Database) {}

  create(r: NewReflection): Reflection {
    const id = newId();
    const createdAt = now();
    this.db
      .prepare(
        `INSERT INTO reflections(
           id, period_start, period_end, kind, title, themes, wins, concerns,
           open_threads, body, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        r.periodStart,
        r.periodEnd,
        r.kind,
        r.title ?? null,
        JSON.stringify(r.themes ?? []),
        JSON.stringify(r.wins ?? []),
        JSON.stringify(r.concerns ?? []),
        JSON.stringify(r.openThreads ?? []),
        r.body,
        createdAt,
      );
    return {
      id,
      createdAt,
      ...r,
      themes: r.themes ?? [],
      wins: r.wins ?? [],
      concerns: r.concerns ?? [],
      openThreads: r.openThreads ?? [],
    };
  }

  latest(kind: ReflectionKind): Reflection | undefined {
    const row = this.db
      .prepare(
        `SELECT id, period_start, period_end, kind, title, themes, wins,
                concerns, open_threads, body, created_at
         FROM reflections WHERE kind = ?
         ORDER BY period_end DESC LIMIT 1`,
      )
      .get(kind) as ReflectionRow | undefined;
    return row ? rowToReflection(row) : undefined;
  }

  /** All reflections, newest first. Used by the markdown export. */
  all(): Reflection[] {
    const rows = this.db
      .prepare(
        `SELECT id, period_start, period_end, kind, title, themes, wins,
                concerns, open_threads, body, created_at
         FROM reflections ORDER BY period_end DESC`,
      )
      .all() as ReflectionRow[];
    return rows.map(rowToReflection);
  }

  /**
   * Find a reflection already generated for the exact (kind, period) window.
   * Used to dedup re-runs — a repeated cron fire over the same window should
   * reuse the existing reflection rather than generate (and re-push) another.
   */
  findByPeriod(
    kind: ReflectionKind,
    periodStart: number,
    periodEnd: number,
  ): Reflection | undefined {
    const row = this.db
      .prepare(
        `SELECT id, period_start, period_end, kind, title, themes, wins,
                concerns, open_threads, body, created_at
         FROM reflections
         WHERE kind = ? AND period_start = ? AND period_end = ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(kind, periodStart, periodEnd) as ReflectionRow | undefined;
    return row ? rowToReflection(row) : undefined;
  }

  /** Whether this reflection has already been written to a Capacities daily note. */
  wasPushedToCapacities(id: string): boolean {
    const row = this.db
      .prepare("SELECT pushed_to_capacities_at FROM reflections WHERE id = ?")
      .get(id) as { pushed_to_capacities_at: number | null } | undefined;
    return !!row && row.pushed_to_capacities_at !== null;
  }

  /** Mark this reflection as pushed to Capacities. Idempotent. */
  markPushedToCapacities(id: string, at: number = now()): void {
    this.db
      .prepare("UPDATE reflections SET pushed_to_capacities_at = ? WHERE id = ?")
      .run(at, id);
  }

  /**
   * Recent reflections, optionally filtered by kind. Default sort is
   * `period_end DESC` so the most recent window appears first regardless of
   * when the cron run produced it.
   */
  list(filter?: { kind?: ReflectionKind; limit?: number }): Reflection[] {
    const limit = filter?.limit ?? 10;
    const params: unknown[] = [];
    let where = "";
    if (filter?.kind) {
      where = "WHERE kind = ?";
      params.push(filter.kind);
    }
    params.push(limit);
    const rows = this.db
      .prepare(
        `SELECT id, period_start, period_end, kind, title, themes, wins,
                concerns, open_threads, body, created_at
         FROM reflections ${where}
         ORDER BY period_end DESC LIMIT ?`,
      )
      .all(...params) as ReflectionRow[];
    return rows.map(rowToReflection);
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) as c FROM reflections").get() as {
      c: number;
    };
    return row.c;
  }
}
