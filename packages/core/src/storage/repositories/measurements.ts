import type { Database } from "better-sqlite3";
import type { Measurement, MeasurementRange, NewMeasurement } from "@lifecoach/schemas";
import { newId, now } from "../../util/ids.js";

interface MeasurementRow {
  id: string;
  metric: string;
  value: number;
  unit: string | null;
  recorded_at: number;
  source_document_id: string | null;
  created_at: number;
}

const rowToMeasurement = (row: MeasurementRow): Measurement => ({
  id: row.id,
  metric: row.metric,
  value: row.value,
  unit: row.unit ?? undefined,
  recordedAt: row.recorded_at,
  sourceDocumentId: row.source_document_id ?? undefined,
  createdAt: row.created_at,
});

export class MeasurementRepository {
  constructor(private readonly db: Database) {}

  create(m: NewMeasurement): Measurement {
    const id = newId();
    const createdAt = now();
    this.db
      .prepare(
        `INSERT INTO measurements(id, metric, value, unit, recorded_at, source_document_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        m.metric,
        m.value,
        m.unit ?? null,
        m.recordedAt,
        m.sourceDocumentId ?? null,
        createdAt,
      );
    return { id, createdAt, ...m };
  }

  query(metric: string, range: MeasurementRange = {}): Measurement[] {
    const conditions = ["metric = ?"];
    const params: unknown[] = [metric];
    if (range.from !== undefined) {
      conditions.push("recorded_at >= ?");
      params.push(range.from);
    }
    if (range.to !== undefined) {
      conditions.push("recorded_at <= ?");
      params.push(range.to);
    }
    const sql = `SELECT id, metric, value, unit, recorded_at, source_document_id, created_at
                 FROM measurements
                 WHERE ${conditions.join(" AND ")}
                 ORDER BY recorded_at ASC`;
    const rows = this.db.prepare(sql).all(...params) as MeasurementRow[];
    return rows.map(rowToMeasurement);
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) as c FROM measurements").get() as {
      c: number;
    };
    return row.c;
  }
}
