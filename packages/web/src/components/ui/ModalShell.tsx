/**
 * ModalShell — the centered-dialog chrome shared by the app's form dialogs:
 * blurred overlay, centered surface card, header with title + close button, a
 * padded body, and a bottom-aligned footer. Extracted from the verbatim copies
 * in NewHabitDialog and CreateFromInsightDialog so overlay/border/close-button
 * styling lives in one place.
 *
 * Pass `onSubmit` to render the body+footer inside a <form> (the common case);
 * omit it for a plain content modal.
 */
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "~/lib/cn";

interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Visually-hidden description satisfying Radix's aria-describedby. */
  description?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  /** When provided, body + footer are wrapped in a <form> with this handler. */
  onSubmit?: (e: React.FormEvent) => void;
  /** Width cap for the surface card. Defaults to max-w-md. */
  maxWidthClass?: string;
  /**
   * Cap the surface at 90dvh and make the body scroll, keeping the header and
   * footer pinned. Use for long/variable content (e.g. a reviewable list); the
   * body keeps its own inner spacing rather than the default space-y-4.
   */
  scrollBody?: boolean;
}

export const ModalShell = ({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  onSubmit,
  maxWidthClass = "max-w-md",
  scrollBody = false,
}: ModalShellProps): JSX.Element => {
  const Surface = onSubmit ? "form" : "div";
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-bg/80 backdrop-blur-[1px]" />
        <Dialog.Content
          className="fixed inset-0 z-50 flex items-center justify-center p-4 outline-none"
          onClick={onClose}
        >
          <Surface
            {...(onSubmit ? { onSubmit } : {})}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            className={cn(
              "flex w-full flex-col rounded-xl border border-border bg-surface shadow-2xl",
              maxWidthClass,
              scrollBody && "max-h-[90dvh]",
            )}
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <Dialog.Title className="text-base font-semibold text-fg">
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description className="sr-only">
                  {description}
                </Dialog.Description>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex size-7 items-center justify-center rounded-md text-fg-faint hover:bg-surface-elevated hover:text-fg"
              >
                <X className="size-4" strokeWidth={1.75} />
              </button>
            </div>

            <div
              className={
                scrollBody
                  ? "flex-1 overflow-y-auto px-5 py-4"
                  : "space-y-4 px-5 py-4"
              }
            >
              {children}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              {footer}
            </div>
          </Surface>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
