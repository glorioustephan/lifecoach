/**
 * PillGroup — a single-select segmented control rendered as a row of equal-width
 * pills. Replaces the hand-rolled type/kind/cadence pill blocks that were
 * copy-pasted across the habit and inbox dialogs. aria-pressed is always set, so
 * every adopter gets consistent screen-reader state for free.
 */
import { cn } from "~/lib/cn";

export interface PillOption<T extends string> {
  value: T;
  label: string;
}

interface PillGroupProps<T extends string> {
  options: ReadonlyArray<PillOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Visible group label rendered above the pills. */
  label?: string;
  /** Accessible name for the group when no visible label is provided. */
  ariaLabel?: string;
  /** Capitalize pill labels (for lowercase option values like cadence). */
  capitalize?: boolean;
}

export function PillGroup<T extends string>({
  options,
  value,
  onChange,
  label,
  ariaLabel,
  capitalize,
}: PillGroupProps<T>): JSX.Element {
  return (
    <div className="space-y-1.5">
      {label && <span className="block text-xs font-medium text-fg-muted">{label}</span>}
      <div className="flex gap-2" role="group" aria-label={ariaLabel ?? label}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={value === opt.value}
            className={cn(
              "flex-1 rounded-md border py-2 text-xs transition-colors",
              capitalize && "capitalize",
              value === opt.value
                ? "border-accent bg-accent/10 text-accent"
                : "border-border-subtle text-fg-muted hover:bg-surface-elevated hover:text-fg",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
