import type { Goal, GoalReviewCadence } from "@lifecoach/schemas";

const DAY = 24 * 60 * 60 * 1000;

/**
 * How many ms can elapse without a touch before a goal counts as "stalled."
 *
 * Slightly looser than the review cadence itself so the briefing's stalled
 * pill doesn't light up *the moment* a review window passes — we give a grace
 * window equal to ~25% of the cadence. `as-needed` goals are never stalled.
 */
export const stalledWindowMs = (reviewCadence: GoalReviewCadence): number | null => {
  switch (reviewCadence) {
    case "weekly":
      return 9 * DAY; // 1 week + ~2-day grace
    case "monthly":
      return 38 * DAY; // ~5-week grace
    case "quarterly":
      return 110 * DAY;
    case "as-needed":
      return null;
  }
};

/**
 * A goal is "stalled" when:
 *   - it is active and not archived, AND
 *   - the most recent touch (last_reviewed_at OR lastEvidenceAt) is older than
 *     the cadence-derived window.
 *
 * If neither timestamp is present we fall back to the goal's createdAt — a
 * brand-new goal isn't immediately stalled, but one that's been around 2+ weeks
 * with zero touches under a weekly cadence absolutely is.
 */
export const isGoalStalled = (
  goal: Goal,
  lastEvidenceAt: number | null,
  nowMs: number = Date.now(),
): boolean => {
  if (goal.status !== "active" || goal.archivedAt !== null) return false;
  const window = stalledWindowMs(goal.reviewCadence);
  if (window === null) return false;
  const lastTouch = Math.max(
    goal.lastReviewedAt ?? 0,
    lastEvidenceAt ?? 0,
    goal.createdAt,
  );
  return nowMs - lastTouch > window;
};
