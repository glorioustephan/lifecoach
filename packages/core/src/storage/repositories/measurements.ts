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

export interface MeasurementSummary {
  metric: string;
  count: number;
  unit: string | null;
  latest: Measurement | null;
  previous: Measurement | null;
  delta: number | null;
  deltaPercent: number | null;
  rollingAverage: number | null;
  unitMismatch: boolean;
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

  latest(metric: string): Measurement | undefined {
    const row = this.db
      .prepare(
        `SELECT id, metric, value, unit, recorded_at, source_document_id, created_at
         FROM measurements
         WHERE metric = ?
         ORDER BY recorded_at DESC
         LIMIT 1`,
      )
      .get(metric) as MeasurementRow | undefined;
    return row ? rowToMeasurement(row) : undefined;
  }

  summarize(metric: string, range: MeasurementRange = {}, rollingWindow = 7): MeasurementSummary {
    const rows = this.query(metric, range);
    const latest = rows.at(-1) ?? null;
    const previous = rows.length >= 2 ? rows.at(-2)! : null;
    const units = new Set(rows.map((m) => m.unit ?? null));
    const unitMismatch = units.size > 1;
    const delta = !unitMismatch && latest && previous ? latest.value - previous.value : null;
    const deltaPercent =
      delta !== null && previous && previous.value !== 0
        ? (delta / Math.abs(previous.value)) * 100
        : null;
    const windowRows = rows.slice(-rollingWindow);
    const rollingAverage =
      !unitMismatch && windowRows.length >= 2
        ? windowRows.reduce((sum, m) => sum + m.value, 0) / windowRows.length
        : null;
    return {
      metric,
      count: rows.length,
      unit: unitMismatch ? null : latest?.unit ?? null,
      latest,
      previous,
      delta,
      deltaPercent,
      rollingAverage,
      unitMismatch,
    };
  }

  /**
   * Delete every measurement of `metric` recorded at or after `fromMs`.
   * Returns the number of rows removed. Used by the financial resync flow to
   * clear today's stale snapshot before recomputing it after a code change
   * (e.g. transfer filtering) — without this, the once-per-day idempotency
   * guard in `snapshotFinancialMetrics` would skip the recompute and leave
   * the inflated number in place until tomorrow.
   */
  deleteSince(metric: string, fromMs: number): number {
    const info = this.db
      .prepare(`DELETE FROM measurements WHERE metric = ? AND recorded_at >= ?`)
      .run(metric, fromMs);
    return info.changes;
  }

  /**
   * Distinct metric names with at least one observation since `fromMs`. Used
   * by the attention loop to enumerate recently-touched metrics without
   * pulling the full row set.
   */
  distinctMetrics(fromMs: number): string[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT metric FROM measurements
         WHERE recorded_at >= ?
         ORDER BY metric ASC`,
      )
      .all(fromMs) as Array<{ metric: string }>;
    return rows.map((r) => r.metric);
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) as c FROM measurements").get() as {
      c: number;
    };
    return row.c;
  }
}
