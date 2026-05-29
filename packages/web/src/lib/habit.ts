/**
 * Pure helper utilities for the habits domain — date math, calendar
 * grid generation, streak calculation, and cadence-due checks.
 *
 * No side-effects, no imports from app code, safe to unit-test in isolation.
 */
import type { HabitRow } from "./api";

// ─── Date key ─────────────────────────────────────────────────────────────────

/**
 * Returns an ISO-8601 local date string "YYYY-MM-DD" for a given Date.
 * All bucketing in this app is by local timezone (single-user app).
 */
export const dateKey = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// ─── Month grid ───────────────────────────────────────────────────────────────

/**
 * Returns all Date cells for a calendar month grid, including leading and
 * trailing padding from adjacent months so the grid is always a full set
 * of 5–6 complete weeks (35–42 cells).
 *
 * @param year - full 4-digit year
 * @param month - 1-indexed month (1 = January, 12 = December)
 * @param firstDayOfWeek - 0 = Sunday, 1 = Monday (default ISO-8601)
 */
export const monthDays = (
  year: number,
  month: number,
  firstDayOfWeek: 0 | 1 = 1,
): Date[] => {
  // First day of the target month.
  const first = new Date(year, month - 1, 1);
  // Last day of the target month.
  const last = new Date(year, month, 0);

  // How many leading padding cells from the previous month?
  // getDay() returns 0=Sun…6=Sat. Adjust for firstDayOfWeek offset.
  const leadingEmpty = (first.getDay() - firstDayOfWeek + 7) % 7;

  const cells: Date[] = [];

  // Leading cells from prior month.
  for (let i = leadingEmpty; i > 0; i--) {
    cells.push(new Date(year, month - 1, 1 - i));
  }

  // All days in the target month.
  for (let d = 1; d <= last.getDate(); d++) {
    cells.push(new Date(year, month - 1, d));
  }

  // Trailing cells to fill out to a multiple of 7.
  const trailing = (7 - (cells.length % 7)) % 7;
  for (let i = 1; i <= trailing; i++) {
    cells.push(new Date(year, month, i));
  }

  return cells;
};

// ─── Streak computation ───────────────────────────────────────────────────────

/**
 * Computes current and longest streaks from a completion map.
 *
 * @param completions - Map of YYYY-MM-DD → count of completions that day
 * @param today - YYYY-MM-DD string for "today" (inject for testability)
 * @returns current streak (consecutive days ending today or yesterday),
 *          longest streak ever seen in the map, and the key of the last
 *          completed day.
 */
export const computeStreak = (
  completions: Map<string, number>,
  today: string,
): { current: number; longest: number; lastCompletedKey: string | null } => {
  if (completions.size === 0) {
    return { current: 0, longest: 0, lastCompletedKey: null };
  }

  // Collect all keys with count ≥ 1, sorted ascending.
  const keys = Array.from(completions.entries())
    .filter(([, count]) => count >= 1)
    .map(([k]) => k)
    .sort();

  if (keys.length === 0) {
    return { current: 0, longest: 0, lastCompletedKey: null };
  }

  const lastKey = keys[keys.length - 1] ?? null;

  // Walk backward from today to find current streak.
  let current = 0;
  const cursor = new Date(today + "T00:00:00");
  for (;;) {
    const k = dateKey(cursor);
    if (completions.get(k) !== undefined && (completions.get(k) ?? 0) >= 1) {
      current++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  // Walk entire history to find longest streak.
  let longest = 0;
  let run = 0;
  let prevKey: string | null = null;
  for (const k of keys) {
    if (prevKey === null) {
      run = 1;
    } else {
      // Are these two keys consecutive calendar days?
      const prev = new Date(prevKey + "T00:00:00");
      const curr = new Date(k + "T00:00:00");
      const diffDays = Math.round(
        (curr.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000),
      );
      run = diffDays === 1 ? run + 1 : 1;
    }
    if (run > longest) longest = run;
    prevKey = k;
  }

  return { current, longest, lastCompletedKey: lastKey };
};

// ─── Cadence due check ────────────────────────────────────────────────────────

/**
 * Returns true if a habit with the given cadence is "due" on the provided date.
 *
 * - daily: always true
 * - weekly: true on Monday (ISO-8601 first day of week, per design default)
 * - monthly: true on the 1st
 */
export const isCadenceDueOn = (
  cadence: HabitRow["cadence"],
  date: Date,
): boolean => {
  switch (cadence) {
    case "daily":
      return true;
    case "weekly":
      // getDay(): 0=Sun, 1=Mon…6=Sat
      return date.getDay() === 1;
    case "monthly":
      return date.getDate() === 1;
  }
};
