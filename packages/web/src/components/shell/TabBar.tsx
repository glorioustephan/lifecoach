import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";
import { cn } from "~/lib/cn";
import { NAV_ITEMS } from "./nav-items";
import { MobileNavSheet } from "./MobileNavSheet";

/**
 * Mobile bottom tab bar. Hidden at md+ (rail takes over).
 * Shows Chat, Inbox, Memory, Tasks as direct Links plus a "More" button
 * that opens MobileNavSheet for all remaining destinations.
 */
export const TabBar = (): JSX.Element => {
  const { location } = useRouterState();
  const [moreOpen, setMoreOpen] = useState(false);

  const tabs = NAV_ITEMS.filter((item) => item.inTabBar);

  // "More" is active when the current route is not one of the four tab destinations.
  const tabPaths = tabs.map((item) => item.to);
  const isTabRoute =
    location.pathname === "/" ||
    location.pathname.startsWith("/c/") ||
    tabPaths
      .filter((p) => p !== "/")
      .some((p) => location.pathname.startsWith(p));
  // Highlight "More" when its section is the current route OR while the drawer
  // is open (the open drawer is itself a form of active state).
  const isMoreActive = !isTabRoute || moreOpen;

  return (
    <>
      <nav
        aria-label="Primary navigation"
        className="safe-pb fixed inset-x-0 bottom-0 z-40 flex h-14 items-stretch border-t border-border bg-bg md:hidden"
      >
        {tabs.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.to === "/"
              ? location.pathname === "/" || location.pathname.startsWith("/c/")
              : location.pathname.startsWith(item.to);
          return (
            <Link
              key={item.id}
              to={item.to}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium tracking-wide transition-colors active:scale-[1.05]",
                isActive ? "text-accent" : "text-fg-faint",
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon
                aria-hidden
                className={cn("size-6", isActive && "text-accent")}
                strokeWidth={1.75}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}

        {/* More button — opens full nav sheet */}
        <button
          type="button"
          aria-label="More navigation destinations"
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
          onClick={() => setMoreOpen(true)}
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium tracking-wide transition-colors active:scale-[1.05]",
            isMoreActive ? "text-accent" : "text-fg-faint",
          )}
        >
          <MoreHorizontal
            aria-hidden
            className={cn("size-6", isMoreActive && "text-accent")}
            strokeWidth={1.75}
          />
          <span>More</span>
        </button>
      </nav>

      <MobileNavSheet open={moreOpen} onOpenChange={setMoreOpen} />
    </>
  );
};
