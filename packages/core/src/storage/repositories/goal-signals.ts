import type { Database } from "better-sqlite3";
import type {
  GoalSignal,
  GoalSignalKind,
  NewGoalSignal,
} from "@lifecoach/schemas";
import { newId, now } from "../../util/ids.js";

interface SignalRow {
  id: string;
  goal_id: string;
  label: string;
  kind: string;
  metric: string | null;
  target_value: number | null;
  current_value: number | null;
  unit: string | null;
  created_at: number;
  updated_at: number;
}

const FULL =
  "id, goal_id, label, kind, metric, target_value, current_value, unit, " +
  "created_at, updated_at";

const rowToSignal = (row: SignalRow): GoalSignal => ({
  id: row.id,
  goalId: row.goal_id,
  label: row.label,
  kind: row.kind as GoalSignalKind,
  metric: row.metric,
  targetValue: row.target_value,
  currentValue: row.current_value,
  unit: row.unit,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export interface GoalSignalListFilter {
  goalId?: string;
  limit?: number;
}

export class GoalSignalRepository {
  constructor(private readonly db: Database) {}

  create(s: NewGoalSignal): GoalSignal {
    const id = newId();
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO goal_signals(${FULL}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        s.goalId,
        s.label,
        s.kind ?? "qualitative",
        s.metric ?? null,
        s.targetValue ?? null,
        s.currentValue ?? null,
        s.unit ?? null,
        ts,
        ts,
      );
    return {
      id,
      goalId: s.goalId,
      label: s.label,
      kind: (s.kind ?? "qualitative") as GoalSignalKind,
      metric: s.metric ?? null,
      targetValue: s.targetValue ?? null,
      currentValue: s.currentValue ?? null,
      unit: s.unit ?? null,
      createdAt: ts,
      updatedAt: ts,
    };
  }

  get(id: string): GoalSignal | undefined {
    const row = this.db
      .prepare(`SELECT ${FULL} FROM goal_signals WHERE id = ?`)
      .get(id) as SignalRow | undefined;
    return row ? rowToSignal(row) : undefined;
  }

  list(filter: GoalSignalListFilter = {}): GoalSignal[] {
    const limit = filter.limit ?? 50;
    if (filter.goalId) {
      const rows = this.db
        .prepare(
          `SELECT ${FULL} FROM goal_signals WHERE goal_id = ?
           ORDER BY created_at ASC LIMIT ?`,
        )
        .all(filter.goalId, limit) as SignalRow[];
      return rows.map(rowToSignal);
    }
    const rows = this.db
      .prepare(
        `SELECT ${FULL} FROM goal_signals ORDER BY created_at DESC LIMIT ?`,
      )
      .all(limit) as SignalRow[];
    return rows.map(rowToSignal);
  }

  update(
    id: string,
    patch: {
      label?: string | undefined;
      kind?: GoalSignalKind | undefined;
      metric?: string | null | undefined;
      targetValue?: number | null | undefined;
      currentValue?: number | null | undefined;
      unit?: string | null | undefined;
    },
  ): GoalSignal | undefined {
    const existing = this.get(id);
    if (!existing) return undefined;
    const ts = now();
    this.db
      .prepare(
        `UPDATE goal_signals SET
           label = ?, kind = ?, metric = ?, target_value = ?, current_value = ?,
           unit = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        patch.label ?? existing.label,
        patch.kind ?? existing.kind,
        patch.metric === undefined ? existing.metric : patch.metric,
        patch.targetValue === undefined ? existing.targetValue : patch.targetValue,
        patch.currentValue === undefined ? existing.currentValue : patch.currentValue,
        patch.unit === undefined ? existing.unit : patch.unit,
        ts,
        id,
      );
    return this.get(id);
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM goal_signals WHERE id = ?").run(id);
  }
}
