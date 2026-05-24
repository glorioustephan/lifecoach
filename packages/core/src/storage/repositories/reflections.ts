import type { Database } from "better-sqlite3";
import type { NewReflection, Reflection, ReflectionKind } from "@lifecoach/schemas";
import { newId, now } from "../../util/ids.js";

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

const parseStringArray = (raw: string): string[] => {
  const parsed = JSON.parse(raw) as unknown;
  return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
};

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

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) as c FROM reflections").get() as {
      c: number;
    };
    return row.c;
  }
}
