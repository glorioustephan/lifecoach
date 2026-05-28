import { cn } from "~/lib/cn";

export const formControlClass = (...className: Array<string | false | null | undefined>): string =>
  cn(
    "rounded-md border border-border bg-surface-elevated text-fg placeholder:text-fg-faint transition-colors",
    "focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
    "disabled:cursor-not-allowed disabled:opacity-50",
    ...className,
  );

export const compactFormControlClass = (
  ...className: Array<string | false | null | undefined>
): string =>
  formControlClass("px-2 py-1 text-xs", ...className);
