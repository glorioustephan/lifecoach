/**
 * HabitCalendar — single-habit month grid.
 *
 * Pure presentational: renders a 7-column calendar for one habit's completions.
 * Used inside HabitDetailSheet (Calendar tab) and composed into HabitGrid.
 *
 * ADHD-1: Visual state per cell — done/empty/today/future — at a glance.
 */
import { monthDays, dateKey } from "~/lib/habit";
import { HabitCell, type HabitCellVariant } from "./HabitCell";

// Mon Tue Wed Thu Fri Sat Sun
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface HabitCalendarProps {
  year: number;
  month: number; // 1-indexed
  completions: Map<string, number>;
  todayKey: string; // YYYY-MM-DD
  onCellClick?: (key: string) => void;
  habitTitle: string;
}

const getCellVariant = (
  cellDate: Date,
  cellMonth: number, // 1-indexed month of the calendar being displayed
  cellKey: string,
  todayKey: string,
  completions: Map<string, number>,
): HabitCellVariant => {
  // Padding cells from adjacent months.
  if (cellDate.getMonth() + 1 !== cellMonth) return "disabled";

  const isPast = cellKey < todayKey;
  const isToday = cellKey === todayKey;
  const isFuture = cellKey > todayKey;
  const isDone = (completions.get(cellKey) ?? 0) >= 1;

  if (isFuture) return "future";
  if (isToday) return isDone ? "today-done" : "today-empty";
  if (isPast) return isDone ? "done" : "empty-past";

  return "empty-past"; // unreachable but satisfies exhaustiveness
};

export const HabitCalendar = ({
  year,
  month,
  completions,
  todayKey,
  onCellClick,
  habitTitle,
}: HabitCalendarProps): JSX.Element => {
  const cells = monthDays(year, month);

  return (
    <div role="grid" aria-label={`${habitTitle} calendar`}>
      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1" role="row">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            role="columnheader"
            className="flex h-7 items-center justify-center text-[10px] font-medium uppercase tracking-wide text-fg-faint"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1" role="rowgroup">
        {cells.map((cellDate) => {
          const key = dateKey(cellDate);
          const variant = getCellVariant(cellDate, month, key, todayKey, completions);
          return (
            <div key={key} role="gridcell">
              <HabitCell
                variant={variant}
                dateKey={key}
                habitTitle={habitTitle}
                onClick={
                  (variant === "empty-past" || variant === "today-empty") && onCellClick
                    ? () => onCellClick(key)
                    : undefined
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
