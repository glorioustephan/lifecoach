/**
 * StreakBadge — pure presentational badge for habit streak display.
 *
 * ADHD-4: No-shame streak language. Show "Last: 3d ago" for gaps,
 *         never "you broke your streak" or "0-day streak".
 *         No fire icon when there's no active streak.
 */
import { cn } from "~/lib/cn";

interface StreakBadgeProps {
  current: number;
  lastCompletedKey: string | null; // YYYY-MM-DD or null
  todayKey: string; // YYYY-MM-DD
  className?: string;
}

/**
 * Returns a relative label for a YYYY-MM-DD key relative to today.
 * e.g. "today", "yesterday", "3d ago".
 */
const relativeDay = (key: string, todayKey: string): string => {
  const today = new Date(todayKey + "T00:00:00");
  const target = new Date(key + "T00:00:00");
  const diffMs = today.getTime() - target.getTime();
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  return `${diffDays}d ago`;
};

export const StreakBadge = ({
  current,
  lastCompletedKey,
  todayKey,
  className,
}: StreakBadgeProps): JSX.Element | null => {
  // ADHD-4: no badge at all when never started — omitting is kinder than "0-day".
  if (!lastCompletedKey) return null;

  const lastLabel = relativeDay(lastCompletedKey, todayKey);

  if (current >= 2) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
          "bg-warning-500/10 text-xs font-medium text-warning-500",
          className,
        )}
        aria-label={`${current}-day streak, last completed ${lastLabel}`}
      >
        🔥 {current}-day · Last: {lastLabel}
      </span>
    );
  }

  if (current === 1 && lastCompletedKey === todayKey) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
          "bg-warning-500/10 text-xs font-medium text-warning-500",
          className,
        )}
        aria-label="1-day streak, logged today"
      >
        🔥 1-day · Today
      </span>
    );
  }

  // ADHD-4: no flame when streak is broken — just show when they last did it.
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5",
        "bg-surface-elevated text-xs text-fg-muted",
        className,
      )}
      aria-label={`Last completed ${lastLabel}`}
    >
      Last: {lastLabel}
    </span>
  );
};
