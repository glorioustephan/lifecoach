import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "~/lib/cn";
import { Sheet, SheetHeader, SheetBody, SheetDescription } from "~/components/ui/Sheet";
import { NAV_ITEMS } from "./nav-items";

interface MobileNavSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Full-width mobile navigation drawer that exposes ALL nav destinations.
 * Opened from the "More" button in TabBar. Closes on navigation or dismiss.
 */
export const MobileNavSheet = ({ open, onOpenChange }: MobileNavSheetProps): JSX.Element => {
  const { location } = useRouterState();

  return (
    <Sheet side="bottom" open={open} onOpenChange={onOpenChange} width="w-full md:w-[400px]">
      <SheetHeader title="Menu" onClose={() => onOpenChange(false)} />
      <SheetDescription className="sr-only">All navigation destinations</SheetDescription>
      <SheetBody>
        <nav aria-label="All destinations">
          <ul className="safe-pb flex flex-col gap-0.5 px-3 py-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.to === "/"
                  ? location.pathname === "/" || location.pathname.startsWith("/c/")
                  : location.pathname.startsWith(item.to);

              return (
                <li key={item.id}>
                  <Link
                    to={item.to}
                    onClick={() => onOpenChange(false)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex h-12 items-center gap-3 rounded-md px-3 text-sm transition-colors",
                      isActive
                        ? "bg-surface-elevated text-fg"
                        : "text-fg-muted hover:bg-surface-elevated/40 hover:text-fg",
                    )}
                  >
                    <Icon
                      aria-hidden
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
        </nav>
      </SheetBody>
    </Sheet>
  );
};
