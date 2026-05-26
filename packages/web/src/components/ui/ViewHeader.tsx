import type { ReactNode } from "react";
import { cn } from "~/lib/cn";

interface Props {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Use "wide" for data-dense routes (max-w-3xl). Defaults to "default" (max-w-2xl). */
  width?: "default" | "wide";
}

export const ViewHeader = ({ title, subtitle, actions, width = "default" }: Props): JSX.Element => (
  <header className="border-b border-border">
    <div
      className={cn(
        "mx-auto flex h-12 items-center justify-between px-4 md:px-6",
        width === "wide" ? "max-w-3xl" : "max-w-2xl",
      )}
    >
      <div className="min-w-0">
        <h1 className="truncate text-sm font-medium text-fg">{title}</h1>
        {subtitle && (
          <p className="truncate text-xs text-fg-faint">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  </header>
);
