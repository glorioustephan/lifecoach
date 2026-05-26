import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "~/lib/cn";
import { NAV_ITEMS } from "./nav-items";
import { GlobalStatus } from "./GlobalStatus";

/**
 * Persistent left rail. Visible only at md+. On smaller viewports the
 * TabBar takes over.
 */
export const RailNav = (): JSX.Element => {
  const { location } = useRouterState();

  // Check if the current location is settings with ?tab=sources (the Sources redirect target).
  const isSourcesTab =
    location.pathname === "/settings" &&
    new URLSearchParams(location.search).get("tab") === "sources";

  return (
    <nav
      aria-label="Primary navigation"
      className="hidden w-60 shrink-0 flex-col border-r border-border bg-bg md:flex"
    >
      <div className="flex items-center px-5 py-5">
        <span className="text-sm font-semibold tracking-tight text-fg">Lifecoach</span>
      </div>

      <ul className="flex flex-1 flex-col gap-0.5 px-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;

          let isActive: boolean;
          if (item.id === "sources") {
            // Sources is active when: on /sources itself, or on /settings?tab=sources
            isActive =
              location.pathname === "/sources" ||
              location.pathname.startsWith("/sources") ||
              isSourcesTab;
          } else if (item.id === "settings") {
            // Settings is active on /settings only when NOT on the sources tab
            isActive =
              location.pathname.startsWith("/settings") && !isSourcesTab;
          } else if (item.to === "/") {
            isActive =
              location.pathname === "/" || location.pathname.startsWith("/c/");
          } else {
            isActive = location.pathname.startsWith(item.to);
          }

          return (
            <li key={item.id}>
              <Link
                to={item.to}
                className={cn(
                  "group flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-surface-elevated text-fg"
                    : "text-fg-muted hover:bg-surface-elevated/40 hover:text-fg",
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon
                  className={cn(
                    "size-5 shrink-0",
                    isActive ? "text-accent" : "text-fg-muted",
                  )}
                  strokeWidth={1.75}
                />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <GlobalStatus />
    </nav>
  );
};
