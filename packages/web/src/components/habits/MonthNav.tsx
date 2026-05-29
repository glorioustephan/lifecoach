/**
 * MonthNav — ‹ Month YYYY › navigation control.
 * Reused by the Calendar route view and HabitDetailSheet.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton } from "~/components/ui/IconButton";
import { cn } from "~/lib/cn";

interface MonthNavProps {
  year: number;
  month: number; // 1-indexed
  onChange: (year: number, month: number) => void;
  className?: string;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const MonthNav = ({ year, month, onChange, className }: MonthNavProps): JSX.Element => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-indexed

  const isNextDisabled = year === currentYear && month === currentMonth;

  const handlePrev = () => {
    if (month === 1) {
      onChange(year - 1, 12);
    } else {
      onChange(year, month - 1);
    }
  };

  const handleNext = () => {
    if (isNextDisabled) return;
    if (month === 12) {
      onChange(year + 1, 1);
    } else {
      onChange(year, month + 1);
    }
  };

  return (
    <div className={cn("flex items-center justify-center gap-2", className)}>
      <IconButton
        size="sm"
        aria-label="Previous month"
        onClick={handlePrev}
      >
        <ChevronLeft className="size-4" strokeWidth={1.75} />
      </IconButton>
      <span className="min-w-[120px] text-center text-sm font-medium text-fg">
        {MONTH_NAMES[month - 1]} {year}
      </span>
      <IconButton
        size="sm"
        aria-label="Next month"
        onClick={handleNext}
        disabled={isNextDisabled}
      >
        <ChevronRight className="size-4" strokeWidth={1.75} />
      </IconButton>
    </div>
  );
};
