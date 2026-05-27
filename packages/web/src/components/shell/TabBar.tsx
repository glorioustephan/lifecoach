import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { cn } from "~/lib/cn";
import { NAV_ITEMS } from "./nav-items";
import { MoreNavSheet } from "./MoreNavSheet";

/**
 * Mobile bottom tab bar. Hidden at md+ (rail takes over).
 */
export const TabBar = (): JSX.Element => {
  const { location } = useRouterState();
  const [moreOpen, setMoreOpen] = useState(false);

  const tabs = NAV_ITEMS.filter((item) => item.inTabBar);
  const moreItems = NAV_ITEMS.filter((item) => !item.inTabBar);

  const isMoreActive = moreItems.some((item) =>
    location.pathname.startsWith(item.to),
  );

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
                className={cn("size-6", isActive && "text-accent")}
                strokeWidth={1.75}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-label="More navigation"
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium tracking-wide transition-colors active:scale-[1.05]",
            isMoreActive ? "text-accent" : "text-fg-faint",
          )}
        >
          <Menu
            className={cn("size-6", isMoreActive && "text-accent")}
            strokeWidth={1.75}
          />
          <span>More</span>
        </button>
      </nav>

      <MoreNavSheet open={moreOpen} onOpenChange={setMoreOpen} />
    </>
  );
};
