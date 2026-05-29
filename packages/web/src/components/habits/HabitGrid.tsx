/**
 * HabitGrid — multi-habit Arch•a•Track calendar table.
 *
 * Rows = habits, columns = days of the selected month.
 *
 * ADHD-1: Visual completion state at a glance across all habits.
 * ADHD-10: Same tap-to-toggle interaction as HabitCalendar (consistent gesture).
 *
 * Responsive:
 * - md+: full grid, no scroll needed for typical month widths
 * - below md: horizontal scroll wrapper with sticky first column
 */
import { cn } from "~/lib/cn";
import { dateKey, monthDays } from "~/lib/habit";
import { type HabitRow } from "~/lib/api";
import { HabitCell, type HabitCellVariant } from "./HabitCell";

interface HabitGridProps {
  habits: HabitRow[];
  year: number;
  month: number; // 1-indexed
  /** Map of habitId → (Map of YYYY-MM-DD → count) */
  byHabit: Map<string, Map<string, number>>;
  onCellClick: (habitId: string, key: string) => void;
  todayKey: string; // YYYY-MM-DD
}

const getCellVariant = (
  cellDate: Date,
  month: number,
  cellKey: string,
  todayKey: string,
  completions: Map<string, number>,
): HabitCellVariant => {
  if (cellDate.getMonth() + 1 !== month) return "disabled";
  const isDone = (completions.get(cellKey) ?? 0) >= 1;
  if (cellKey > todayKey) return "future";
  if (cellKey === todayKey) return isDone ? "today-done" : "today-empty";
  return isDone ? "done" : "empty-past";
};

// ADHD-1: today's column header gets a ring to help orient "right now".
const TodayRing = (): JSX.Element => (
  <span className="absolute inset-0 rounded-sm ring-2 ring-accent ring-offset-1 ring-offset-bg" />
);

export const HabitGrid = ({
  habits,
  year,
  month,
  byHabit,
  onCellClick,
  todayKey,
}: HabitGridProps): JSX.Element => {
  const cells = monthDays(year, month);
  // Only show days that belong to the target month.
  const monthCells = cells.filter((d) => d.getMonth() + 1 === month);

  if (habits.length === 0) return <></>;

  return (
    // Horizontal scroll wrapper for mobile. Sticky first column via z-10 + bg.
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" style={{ minWidth: `${32 + monthCells.length * 40}px` }}>
        <thead>
          <tr>
            {/* Sticky habit-title column header */}
            <th
              scope="col"
              className={cn(
                "sticky left-0 z-10 min-w-[140px] bg-surface px-3 py-2",
                "text-left text-[10px] font-medium uppercase tracking-wide text-fg-faint",
              )}
            >
              Habit
            </th>
            {monthCells.map((d) => {
              const key = dateKey(d);
              const isToday = key === todayKey;
              return (
                <th
                  key={key}
                  scope="col"
                  className="relative p-1 text-center"
                  aria-label={d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                >
                  {isToday && <TodayRing />}
                  <span
                    className={cn(
                      "relative z-10 block text-[10px] font-medium",
                      isToday ? "text-accent" : "text-fg-faint",
                    )}
                  >
                    {d.getDate()}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {habits.map((habit) => {
            const completions = byHabit.get(habit.id) ?? new Map<string, number>();
            return (
              <tr key={habit.id} className="border-t border-border-subtle/50">
                {/* Sticky first column — habit title + parent-goal pill */}
                {/* ADHD-10: consistent sticky-column pattern across any list table */}
                <td
                  className={cn(
                    "sticky left-0 z-10 bg-surface px-3 py-1.5",
                    "min-w-[140px] max-w-[200px]",
                  )}
                >
                  <p className="truncate text-xs font-medium text-fg">{habit.title}</p>
                  {habit.parentGoalId && (
                    <span className="mt-0.5 block truncate text-[10px] text-fg-muted">
                      goal linked
                    </span>
                  )}
                </td>
                {monthCells.map((d) => {
                  const key = dateKey(d);
                  const variant = getCellVariant(d, month, key, todayKey, completions);
                  return (
                    <td key={key} className="p-0.5 text-center">
                      <HabitCell
                        variant={variant}
                        dateKey={key}
                        habitTitle={habit.title}
                        onClick={
                          (variant === "empty-past" || variant === "today-empty")
                            ? () => onCellClick(habit.id, key)
                            : undefined
                        }
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
