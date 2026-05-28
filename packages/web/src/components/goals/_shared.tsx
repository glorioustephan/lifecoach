import type { GoalKind, GoalRow } from "~/lib/api";

/**
 * Shared goal-edit primitives: the per-kind label/hint maps and the Field
 * wrapper used across all four tabs. Extracted from GoalEditSheet.tsx
 * (Wave 5.4) so the tab files don't duplicate these.
 */

export const KIND_LABEL: Record<GoalKind, string> = {
  outcome: "Outcome",
  process: "Process",
  identity: "Identity",
};

export const KIND_HINT: Record<GoalKind, string> = {
  outcome: "A finite achievement with a definable end.",
  process: "A recurring practice with a cadence (daily / weekly / monthly).",
  identity: "Who you are becoming. No end date required.",
};

export const HORIZON_LABEL: Record<GoalRow["horizon"], string> = {
  "this-week": "This week",
  "this-month": "This month",
  "this-quarter": "This quarter",
  "this-year": "This year",
  open: "Open",
};

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <label className="block space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">
          {label}
        </span>
      </div>
      {hint && <p className="text-[11px] text-fg-faint">{hint}</p>}
      {children}
    </label>
  );
}
