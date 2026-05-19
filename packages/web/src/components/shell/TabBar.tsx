import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "~/lib/cn";
import { NAV_ITEMS } from "./nav-items";

/**
 * Mobile bottom tab bar. Hidden at md+ (rail takes over).
 */
export const TabBar = (): JSX.Element => {
  const { location } = useRouterState();
  const tabs = NAV_ITEMS.filter((item) => item.inTabBar);

  return (
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
    </nav>
  );
};
