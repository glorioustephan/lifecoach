import type { Database } from "better-sqlite3";
import type { Insight, NewInsight } from "@lifecoach/schemas";
import { newId, now } from "../../util/ids.js";

interface InsightRow {
  id: string;
  topic: string;
  body: string;
  rationale: string | null;
  source_fact_ids: string;
  created_at: number;
  acted_on_at: number | null;
  dismissed_at: number | null;
}

const rowToInsight = (row: InsightRow): Insight => ({
  id: row.id,
  topic: row.topic,
  body: row.body,
  rationale: row.rationale ?? undefined,
  sourceFactIds: JSON.parse(row.source_fact_ids) as string[],
  createdAt: row.created_at,
  actedOnAt: row.acted_on_at,
  dismissedAt: row.dismissed_at,
});

export class InsightRepository {
  constructor(private readonly db: Database) {}

  create(i: NewInsight): Insight {
    const id = newId();
    const createdAt = now();
    this.db
      .prepare(
        `INSERT INTO insights(id, topic, body, rationale, source_fact_ids, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        i.topic,
        i.body,
        i.rationale ?? null,
        JSON.stringify(i.sourceFactIds ?? []),
        createdAt,
      );
    return {
      id,
      topic: i.topic,
      body: i.body,
      rationale: i.rationale,
      sourceFactIds: i.sourceFactIds ?? [],
      createdAt,
      actedOnAt: null,
      dismissedAt: null,
    };
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) as c FROM insights").get() as {
      c: number;
    };
    return row.c;
  }
}
