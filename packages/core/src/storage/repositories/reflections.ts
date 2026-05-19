import type { Database } from "better-sqlite3";
import type { NewReflection, Reflection, ReflectionKind } from "@lifecoach/schemas";
import { newId, now } from "../../util/ids.js";

interface ReflectionRow {
  id: string;
  period_start: number;
  period_end: number;
  kind: string;
  body: string;
  created_at: number;
}

const rowToReflection = (row: ReflectionRow): Reflection => ({
  id: row.id,
  periodStart: row.period_start,
  periodEnd: row.period_end,
  kind: row.kind as ReflectionKind,
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
        `INSERT INTO reflections(id, period_start, period_end, kind, body, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, r.periodStart, r.periodEnd, r.kind, r.body, createdAt);
    return { id, createdAt, ...r };
  }

  latest(kind: ReflectionKind): Reflection | undefined {
    const row = this.db
      .prepare(
        `SELECT id, period_start, period_end, kind, body, created_at
         FROM reflections WHERE kind = ?
         ORDER BY period_end DESC LIMIT 1`,
      )
      .get(kind) as ReflectionRow | undefined;
    return row ? rowToReflection(row) : undefined;
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) as c FROM reflections").get() as {
      c: number;
    };
    return row.c;
  }
}
