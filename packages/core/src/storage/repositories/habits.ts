import type { Database } from "better-sqlite3";
import type {
  Habit,
  HabitCadence,
  HabitCompletion,
  HabitCompletionOrigin,
  HabitStatus,
  HabitUpdate,
  NewHabit,
  NewHabitCompletion,
} from "@lifecoach/schemas";
import { newId, now } from "../../util/ids.js";

// ── Row shapes ────────────────────────────────────────────────────────────────

interface HabitRow {
  id: string;
  title: string;
  cadence: string;
  status: string;
  parent_goal_id: string | null;
  parent_milestone_id: string | null;
  notes: string | null;
  last_completed_at: number | null;
  created_at: number;
  updated_at: number;
}

interface HabitCompletionRow {
  id: string;
  habit_id: string;
  completed_at: number;
  notes: string | null;
  origin: string;
  created_at: number;
}

// ── Column lists ──────────────────────────────────────────────────────────────

const HABIT_COLS =
  "id, title, cadence, status, parent_goal_id, parent_milestone_id, " +
  "notes, last_completed_at, created_at, updated_at";

const COMPLETION_COLS =
  "id, habit_id, completed_at, notes, origin, created_at";

// ── Row mappers ───────────────────────────────────────────────────────────────

const rowToHabit = (row: HabitRow): Habit => ({
  id: row.id,
  title: row.title,
  cadence: row.cadence as HabitCadence,
  status: row.status as HabitStatus,
  parentGoalId: row.parent_goal_id,
  parentMilestoneId: row.parent_milestone_id,
  notes: row.notes,
  lastCompletedAt: row.last_completed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const rowToCompletion = (row: HabitCompletionRow): HabitCompletion => ({
  id: row.id,
  habitId: row.habit_id,
  completedAt: row.completed_at,
  notes: row.notes,
  origin: row.origin as HabitCompletionOrigin,
  createdAt: row.created_at,
});

// ── HabitRepository ───────────────────────────────────────────────────────────

export interface HabitListFilter {
  status?: HabitStatus | "all" | undefined;
  parentGoalId?: string | undefined;
  parentMilestoneId?: string | undefined;
  limit?: number | undefined;
}

export class HabitRepository {
  constructor(private readonly db: Database) {}

  create(h: NewHabit): Habit {
    const id = newId();
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO habits(${HABIT_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        h.title,
        h.cadence,
        h.status ?? "active",
        h.parentGoalId ?? null,
        h.parentMilestoneId ?? null,
        h.notes ?? null,
        null, // last_completed_at — always null on create
        ts,
        ts,
      );
    return {
      id,
      title: h.title,
      cadence: h.cadence,
      status: (h.status ?? "active") as HabitStatus,
      parentGoalId: h.parentGoalId ?? null,
      parentMilestoneId: h.parentMilestoneId ?? null,
      notes: h.notes ?? null,
      lastCompletedAt: null,
      createdAt: ts,
      updatedAt: ts,
    };
  }

  get(id: string): Habit | undefined {
    const row = this.db
      .prepare(`SELECT ${HABIT_COLS} FROM habits WHERE id = ?`)
      .get(id) as HabitRow | undefined;
    return row ? rowToHabit(row) : undefined;
  }

  list(filter: HabitListFilter = {}): Habit[] {
    const limit = filter.limit ?? 200;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.status && filter.status !== "all") {
      conditions.push("status = ?");
      params.push(filter.status);
    }
    if (filter.parentGoalId !== undefined) {
      conditions.push("parent_goal_id = ?");
      params.push(filter.parentGoalId);
    }
    if (filter.parentMilestoneId !== undefined) {
      conditions.push("parent_milestone_id = ?");
      params.push(filter.parentMilestoneId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit);

    const rows = this.db
      .prepare(
        `SELECT ${HABIT_COLS} FROM habits ${where}
         ORDER BY created_at ASC LIMIT ?`,
      )
      .all(...params) as HabitRow[];
    return rows.map(rowToHabit);
  }

  update(id: string, patch: HabitUpdate): Habit | undefined {
    const existing = this.get(id);
    if (!existing) return undefined;
    const ts = now();
    this.db
      .prepare(
        `UPDATE habits SET
           title = ?, cadence = ?, status = ?,
           parent_goal_id = ?, parent_milestone_id = ?,
           notes = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        patch.title ?? existing.title,
        patch.cadence ?? existing.cadence,
        patch.status ?? existing.status,
        patch.parentGoalId === undefined ? existing.parentGoalId ?? null : (patch.parentGoalId ?? null),
        patch.parentMilestoneId === undefined
          ? existing.parentMilestoneId ?? null
          : (patch.parentMilestoneId ?? null),
        patch.notes === undefined ? existing.notes ?? null : (patch.notes ?? null),
        ts,
        id,
      );
    return this.get(id);
  }

  archive(id: string): void {
    const ts = now();
    this.db
      .prepare("UPDATE habits SET status = 'archived', updated_at = ? WHERE id = ?")
      .run(ts, id);
  }

  /** Stamp the `last_completed_at` column — called after logging a completion. */
  setLastCompleted(habitId: string, ts: number): void {
    const nowTs = now();
    this.db
      .prepare("UPDATE habits SET last_completed_at = ?, updated_at = ? WHERE id = ?")
      .run(ts, nowTs, habitId);
  }
}

// ── HabitCompletionRepository ─────────────────────────────────────────────────

export interface HabitCompletionListFilter {
  fromMs?: number | undefined;
  toMs?: number | undefined;
  limit?: number | undefined;
}

export class HabitCompletionRepository {
  constructor(private readonly db: Database) {}

  create(c: NewHabitCompletion): HabitCompletion {
    const id = newId();
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO habit_completions(${COMPLETION_COLS}) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, c.habitId, c.completedAt, c.notes ?? null, c.origin, ts);
    return {
      id,
      habitId: c.habitId,
      completedAt: c.completedAt,
      notes: c.notes ?? null,
      origin: c.origin,
      createdAt: ts,
    };
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM habit_completions WHERE id = ?").run(id);
  }

  listForHabit(habitId: string, filter: HabitCompletionListFilter = {}): HabitCompletion[] {
    const limit = filter.limit ?? 100;
    const conditions: string[] = ["habit_id = ?"];
    const params: unknown[] = [habitId];

    if (filter.fromMs !== undefined) {
      conditions.push("completed_at >= ?");
      params.push(filter.fromMs);
    }
    if (filter.toMs !== undefined) {
      conditions.push("completed_at < ?");
      params.push(filter.toMs);
    }

    params.push(limit);
    const rows = this.db
      .prepare(
        `SELECT ${COMPLETION_COLS} FROM habit_completions
         WHERE ${conditions.join(" AND ")}
         ORDER BY completed_at DESC LIMIT ?`,
      )
      .all(...params) as HabitCompletionRow[];
    return rows.map(rowToCompletion);
  }

  /**
   * Count completions per day for multiple habits in a single query.
   *
   * Returns Map<habitId, Map<"YYYY-MM-DD", count>>.
   *
   * Day bucketing uses server-local time (SQLite `'localtime'` modifier) so
   * the result aligns with the date shown in the UI.
   *
   * Window function template from goal-evidence.ts:153-174.
   */
  countByDayForHabits(
    habitIds: ReadonlyArray<string>,
    fromMs: number,
    toMs: number,
  ): Map<string, Map<string, number>> {
    const result = new Map<string, Map<string, number>>();
    if (habitIds.length === 0) return result;

    const placeholders = habitIds.map(() => "?").join(", ");
    // completed_at is stored as Unix milliseconds; SQLite's datetime() wants
    // Unix seconds, so we divide by 1000 before the epoch conversion.
    const rows = this.db
      .prepare(
        `SELECT
           habit_id,
           date(completed_at / 1000, 'unixepoch', 'localtime') AS day,
           COUNT(*) AS cnt
         FROM habit_completions
         WHERE habit_id IN (${placeholders})
           AND completed_at >= ?
           AND completed_at < ?
         GROUP BY habit_id, day`,
      )
      .all(...habitIds, fromMs, toMs) as Array<{
        habit_id: string;
        day: string;
        cnt: number;
      }>;

    for (const row of rows) {
      let byDay = result.get(row.habit_id);
      if (!byDay) {
        byDay = new Map<string, number>();
        result.set(row.habit_id, byDay);
      }
      byDay.set(row.day, row.cnt);
    }

    return result;
  }
}
