import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "./Button";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: React.ReactNode;
  cancelLabel?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
  isPending?: boolean;
  variant?: "primary" | "destructive";
}

export const ConfirmDialog = ({
  open,
  onOpenChange,
  title,
  body,
  cancelLabel = "Cancel",
  confirmLabel = "Confirm",
  onCancel,
  onConfirm,
  isPending = false,
  variant = "destructive",
}: ConfirmDialogProps): JSX.Element => (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-bg/80 backdrop-blur-[1px]" />
      <Dialog.Content
        className="fixed inset-0 z-50 flex items-center justify-center outline-none"
        onClick={() => onOpenChange(false)}
      >
        <div
          className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <Dialog.Title className="text-base font-semibold text-fg">{title}</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-fg-muted">{body}</Dialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={onCancel}
              disabled={isPending}
            >
              {cancelLabel}
            </Button>
            <Button
              variant={variant}
              size="sm"
              onClick={onConfirm}
              disabled={isPending}
              loading={isPending}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);
