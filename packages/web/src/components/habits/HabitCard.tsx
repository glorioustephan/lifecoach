/**
 * HabitCard — today-view row for a single habit.
 *
 * ADHD-3: Visible next action — the today-cell IS the next action;
 *         it's the most prominent element on the right side of the row.
 * ADHD-1: Single-glance status — cell fill communicates done/not-done
 *         before reading any label.
 */
import { type HabitRow } from "~/lib/api";
import { cn } from "~/lib/cn";
import { HabitCell, type HabitCellVariant } from "./HabitCell";
import { StreakBadge } from "./StreakBadge";

interface HabitCardProps {
  habit: HabitRow;
  todayState: "empty" | "done" | "disabled";
  streak: number;
  lastCompletedKey: string | null;
  todayKey: string;
  onToggle: () => void;
  onOpenDetail: () => void;
}

export const HabitCard = ({
  habit,
  todayState,
  streak,
  lastCompletedKey,
  todayKey,
  onToggle,
  onOpenDetail,
}: HabitCardProps): JSX.Element => {
  const cellVariant: HabitCellVariant =
    todayState === "done"
      ? "today-done"
      : todayState === "disabled"
        ? "disabled"
        : "today-empty";

  return (
    <div className="flex items-center gap-3 rounded-md border border-border-subtle bg-surface px-3 py-2.5">
      {/* Left — title + streak + parent-goal link. Tap opens detail sheet. */}
      {/* ADHD-3: left half is informational; right half is actionable. */}
      <button
        type="button"
        onClick={onOpenDetail}
        className={cn(
          "flex min-w-0 flex-1 flex-col items-start gap-0.5",
          "rounded-sm focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        )}
        aria-label={`Open details for ${habit.title}`}
      >
        <span className="truncate text-sm font-medium text-fg">{habit.title}</span>
        <div className="flex items-center gap-2">
          <StreakBadge
            current={streak}
            lastCompletedKey={lastCompletedKey}
            todayKey={todayKey}
          />
          {habit.parentGoalId && (
            <span className="text-[10px] text-fg-muted">linked to goal</span>
          )}
        </div>
      </button>

      {/* Right — today's HabitCell is the primary action target (ADHD-3). */}
      <HabitCell
        variant={cellVariant}
        dateKey={todayKey}
        habitTitle={habit.title}
        onClick={todayState === "empty" ? onToggle : undefined}
      />
    </div>
  );
};
