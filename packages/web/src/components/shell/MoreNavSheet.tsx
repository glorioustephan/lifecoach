import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "~/lib/cn";
import { Sheet, SheetHeader, SheetBody } from "~/components/ui/Sheet";
import { NAV_ITEMS } from "./nav-items";

interface MoreNavSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const MoreNavSheet = ({
  open,
  onOpenChange,
}: MoreNavSheetProps): JSX.Element => {
  const { location } = useRouterState();

  const isSettingsActive =
    location.pathname.startsWith("/settings") &&
    new URLSearchParams(location.search).get("tab") !== "sources";

  return (
    <Sheet open={open} onOpenChange={onOpenChange} side="left" width="w-full">
      <SheetHeader title="Navigation" onClose={() => onOpenChange(false)} />
      <SheetBody>
        <ul className="flex flex-col gap-0.5 p-3">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;

            let isActive: boolean;
            if (item.id === "settings") {
              isActive = isSettingsActive;
            } else if (item.to === "/") {
              isActive =
                location.pathname === "/" ||
                location.pathname.startsWith("/c/");
            } else {
              isActive = location.pathname.startsWith(item.to);
            }

            return (
              <li key={item.id}>
                <Link
                  to={item.to}
                  onClick={() => onOpenChange(false)}
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
      </SheetBody>
    </Sheet>
  );
};
