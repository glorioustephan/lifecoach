import type { ReactNode } from "react";

interface Props {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export const ViewHeader = ({ title, subtitle, actions }: Props): JSX.Element => (
  <header className="flex h-12 items-center justify-between border-b border-border px-4 md:px-6">
    <div className="min-w-0">
      <h1 className="truncate text-sm font-medium text-fg">{title}</h1>
      {subtitle && (
        <p className="truncate text-xs text-fg-faint">{subtitle}</p>
      )}
    </div>
    {actions && <div className="flex items-center gap-2">{actions}</div>}
  </header>
);
