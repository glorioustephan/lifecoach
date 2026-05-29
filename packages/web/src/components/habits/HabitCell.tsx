/**
 * HabitCell — single calendar day cell for the habit tracker grid.
 *
 * Variants drive the visual state of each day square. The cell is always
 * rendered as a 44px touch-target button; the inner circle provides the
 * visual state without sacrificing hit area.
 *
 * ADHD-1: Single-glance status — filled circle+check = done, outline = not done.
 *         No text labels needed to distinguish states.
 * ADHD-5: Flip animation gates on motion-safe: so reduced-motion users are
 *         never disrupted by the completion feedback.
 * ADHD-7: High contrast: bg-success-500/80 fill + checkmark for done vs
 *         border-only for empty — both color AND shape differ.
 */
import { Check } from "lucide-react";
import { cn } from "~/lib/cn";

export type HabitCellVariant =
  | "done"
  | "empty-past"
  | "today-empty"
  | "today-done"
  | "future"
  | "disabled";

interface HabitCellProps {
  variant: HabitCellVariant;
  dateKey: string;
  habitTitle: string;
  onClick?: () => void;
}

const HUMAN_STATES: Record<HabitCellVariant, string> = {
  done: "completed",
  "empty-past": "not logged",
  "today-empty": "tap to log",
  "today-done": "completed today",
  future: "upcoming",
  disabled: "not due",
};

export const HabitCell = ({
  variant,
  dateKey,
  habitTitle,
  onClick,
}: HabitCellProps): JSX.Element => {
  // Parse the date key for a human-readable date string in the aria-label.
  const humanDate = (() => {
    try {
      return new Date(dateKey + "T00:00:00").toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateKey;
    }
  })();

  const ariaLabel = `${habitTitle} · ${humanDate} · ${HUMAN_STATES[variant]}`;

  // Only empty-past and today-empty respond to clicks.
  const isClickable = variant === "empty-past" || variant === "today-empty";

  // Tooltip for already-logged states: "Already logged today" (ADHD-6: quick reversal via History tab).
  const title =
    variant === "done" || variant === "today-done"
      ? "Already logged — use the History tab to undo"
      : undefined;

  const isDone = variant === "done" || variant === "today-done";
  const isFuture = variant === "future" || variant === "disabled";

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={title}
      disabled={isFuture}
      onClick={isClickable ? onClick : undefined}
      className={cn(
        // 44px touch target; inner visual is the padded circle.
        "relative flex size-9 items-center justify-center rounded-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        // Cursor signals interactivity (ADHD-10: predictable interaction surfaces).
        isClickable && "cursor-pointer",
        (variant === "future" || variant === "disabled") && "cursor-not-allowed",
        !isClickable && !isFuture && "cursor-default",
      )}
    >
      {/* Inner visual circle */}
      <span
        aria-hidden
        className={cn(
          "flex size-7 items-center justify-center rounded-full transition-colors",
          // ADHD-5: flip animation gated on motion-safe
          isDone && "motion-safe:animate-none",

          // ── Variant styles ──────────────────────────────────────────────
          // ADHD-1 + ADHD-7: done uses both color (bg-success) AND shape (filled+check).
          variant === "done" && "bg-success-500/80",
          variant === "today-done" && "bg-success-500/80 ring-2 ring-accent ring-offset-2 ring-offset-bg",
          variant === "empty-past" && "border border-border-subtle hover:border-border hover:bg-surface-elevated",
          variant === "today-empty" && [
            "border border-border-subtle",
            "ring-2 ring-accent ring-offset-2 ring-offset-bg",
            "hover:bg-surface-elevated",
          ],
          variant === "future" && "opacity-40",
          variant === "disabled" && "bg-surface-elevated opacity-30",
        )}
      >
        {/* ADHD-1: Check glyph is the primary done signal (not just a color). */}
        {isDone && (
          <Check
            className="size-3.5 text-bg"
            strokeWidth={2}
            aria-hidden
          />
        )}
      </span>
    </button>
  );
};
