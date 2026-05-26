import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { type ReactNode } from "react";
import { cn } from "~/lib/cn";

/**
 * Sheet primitive built on Radix Dialog. Slides in from a configurable side
 * with the spec's --ease-out-smooth easing. Handles focus trap, scroll lock,
 * escape-to-close, and click-outside-to-close out of the box.
 */
interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: "left" | "right" | "bottom";
  /** Width on md+. Ignored on mobile bottom sheet. */
  width?: string;
  children: ReactNode;
}

const sidePositionClasses: Record<NonNullable<SheetProps["side"]>, string> = {
  left: "inset-y-0 left-0 h-full max-w-full data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left duration-300",
  right:
    "inset-y-0 right-0 h-full max-w-full data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right duration-300",
  bottom:
    "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom duration-300",
};

export const Sheet = ({
  open,
  onOpenChange,
  side = "left",
  width = "w-full md:w-[400px]",
  children,
}: SheetProps): JSX.Element => (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay
        className={cn(
          "fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=open]:fade-in data-[state=closed]:fade-out duration-200",
        )}
      />
      <Dialog.Content
        className={cn(
          "fixed z-50 flex flex-col bg-bg shadow-2xl outline-none",
          "border-border",
          side === "bottom" && "border-t",
          side === "left" && `${width} border-r`,
          side === "right" && `${width} border-l`,
          sidePositionClasses[side],
        )}
      >
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);

interface SheetHeaderProps {
  title: string;
  onClose: () => void;
  /** Optional right-side action (e.g. "Save" link). */
  action?: ReactNode;
}

export const SheetHeader = ({ title, onClose, action }: SheetHeaderProps): JSX.Element => (
  <header className="sticky top-0 z-10 flex h-12 items-center justify-between border-b border-border bg-bg px-4 md:px-6">
    <Dialog.Title className="text-sm font-medium text-fg">{title}</Dialog.Title>
    <div className="flex items-center gap-2">
      {action}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="flex size-9 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-elevated hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        <X className="size-4" strokeWidth={1.75} />
      </button>
    </div>
  </header>
);

export const SheetBody = ({ children }: { children: ReactNode }): JSX.Element => (
  <div className="flex-1 overflow-y-auto">{children}</div>
);

// Re-export for callers that just need the description (a11y).
export const SheetDescription = Dialog.Description;
