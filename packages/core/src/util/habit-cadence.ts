import type { Habit, HabitCadence } from "@lifecoach/schemas";

const DAY = 24 * 60 * 60 * 1000;

/**
 * How many milliseconds may elapse since the last completion before a habit
 * counts as "stalled." Grace margins mirror the goal-cadence thresholds so
 * the two stall indicators feel consistent to the user.
 *
 *   daily   → 2 days  (1 missed day + 1-day grace)
 *   weekly  → 9 days  (1 week + ~2-day grace)
 *   monthly → 38 days (~5-week window — slight grace over a calendar month)
 */
export const habitWindowMs = (cadence: HabitCadence): number => {
  switch (cadence) {
    case "daily":
      return 2 * DAY;
    case "weekly":
      return 9 * DAY;
    case "monthly":
      return 38 * DAY;
  }
};

/**
 * A habit is "stalled" when:
 *   - its status is 'active' (not paused, not archived), AND
 *   - the most recent completion (or, if never completed, the habit's
 *     createdAt) is older than the cadence-derived window.
 *
 * Using createdAt as the fallback means a brand-new habit isn't immediately
 * stalled, but one that has existed for two full windows with zero completions
 * is correctly flagged.
 */
export const isHabitStalled = (
  habit: Habit,
  lastCompletedAt: number | null,
  nowMs: number = Date.now(),
): boolean => {
  if (habit.status !== "active") return false;
  const lastTouch = lastCompletedAt ?? habit.createdAt;
  return nowMs - lastTouch > habitWindowMs(habit.cadence);
};
