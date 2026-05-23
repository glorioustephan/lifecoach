import { cn } from "~/lib/cn";

interface TabNavProps<T extends string> {
  tabs: Array<{ id: T; label: string }>;
  active: T;
  onChange: (id: T) => void;
  variant?: "pill" | "underline";
}

export function TabNav<T extends string>({
  tabs,
  active,
  onChange,
  variant = "underline",
}: TabNavProps<T>): JSX.Element {
  if (variant === "pill") {
    return (
      <nav className="flex items-center gap-1.5 overflow-x-auto border-b border-border-subtle px-4 py-2.5 md:px-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            role="tab"
            aria-selected={active === tab.id}
            className={cn(
              "inline-flex min-h-9 items-center rounded-full px-3 py-1 text-xs font-medium transition-colors",
              active === tab.id
                ? "bg-surface-elevated text-fg"
                : "text-fg-muted hover:bg-surface-elevated/40 hover:text-fg",
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    );
  }

  // underline variant
  return (
    <nav className="flex items-center gap-1 border-b border-border-subtle px-4 md:px-6">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          role="tab"
          aria-selected={active === tab.id}
          className={cn(
            "relative -mb-px px-3 py-2 text-sm transition-colors",
            active === tab.id ? "text-fg" : "text-fg-muted hover:text-fg",
          )}
        >
          {tab.label}
          {active === tab.id && (
            <span aria-hidden className="absolute inset-x-2 -bottom-px h-px bg-accent" />
          )}
        </button>
      ))}
    </nav>
  );
}
