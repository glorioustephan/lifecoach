import { cn } from "~/lib/cn";

interface TabNavProps<T extends string> {
  tabs: Array<{ id: T; label: string }>;
  active: T;
  onChange: (id: T) => void;
  variant?: "pill" | "underline";
  /** Match the content column width. Defaults to "default" (max-w-2xl). */
  width?: "default" | "wide" | "none";
}

export function TabNav<T extends string>({
  tabs,
  active,
  onChange,
  variant = "underline",
  width = "default",
}: TabNavProps<T>): JSX.Element {
  const innerWidth = cn(
    "mx-auto px-4 md:px-6",
    width === "wide" ? "max-w-3xl" : width === "none" ? "" : "max-w-2xl",
  );

  if (variant === "pill") {
    return (
      // Keep border-b full-bleed on the outer element so the rule spans the viewport.
      <div className="border-b border-border-subtle">
        <nav className={cn(innerWidth, "flex h-10 items-center gap-1.5 overflow-x-auto")}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              role="tab"
              aria-selected={active === tab.id}
              className={cn(
                "inline-flex min-h-9 items-center rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap",
                active === tab.id
                  ? "bg-surface-elevated text-fg"
                  : "text-fg-muted hover:bg-surface-elevated/40 hover:text-fg",
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
    );
  }

  // underline variant
  return (
    <div className="border-b border-border-subtle">
      <nav className={cn(innerWidth, "flex h-10 items-center gap-1 overflow-x-auto whitespace-nowrap")}>
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
    </div>
  );
}
