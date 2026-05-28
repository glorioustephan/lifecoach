import { Search } from "lucide-react";
import { cn } from "~/lib/cn";
import { formControlClass } from "./formStyles";

interface FilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  placeholder?: string;
  children?: React.ReactNode;
}

export function FilterBar({
  search,
  onSearchChange,
  placeholder = "Search…",
  children,
}: FilterBarProps): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-2.5 md:px-6">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-faint" />
        <input
          type="text"
          placeholder={placeholder}
          value={search}
          onChange={(e) => onSearchChange(e.currentTarget.value)}
          className={formControlClass("h-11 w-full pl-8 pr-3 text-sm")}
        />
      </div>
      {children}
    </div>
  );
}

interface FilterChipProps {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}

export function FilterChip({ active, onClick, children }: FilterChipProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors",
        active
          ? "border border-accent/40 bg-accent/10 text-accent"
          : "border border-border-subtle text-fg-muted hover:border-accent/40 hover:bg-surface-elevated hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
