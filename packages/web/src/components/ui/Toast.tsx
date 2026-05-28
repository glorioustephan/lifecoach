/**
 * Toast — Radix UI Toast wrapped in semantic tokens.
 *
 * Public API:
 *   - <Toaster /> — single mount in __root.tsx; consumes the module-level
 *     toast() store from ~/lib/use-toast and renders one <ToastRoot> per
 *     active record inside a shared Radix Provider + Viewport.
 *   - toast(input) / toast.success / toast.error / toast.warning / toast.info
 *     — imported from ~/lib/use-toast; callable anywhere (inside mutation
 *     handlers, effects, event listeners).
 */
import * as RadixToast from "@radix-ui/react-toast";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "~/lib/cn";
import { useToast, type ToastVariant } from "~/lib/use-toast";

const toastVariants = cva(
  cn(
    "pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-lg border p-4 pr-10 shadow-lg",
    "bg-surface-elevated text-fg",
    "data-[state=open]:animate-in data-[state=open]:slide-in-from-right-full data-[state=open]:fade-in-0",
    "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right-full data-[state=closed]:fade-out-80",
    "data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none",
    "data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-[transform_200ms_ease-out]",
    "data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)]",
  ),
  {
    variants: {
      variant: {
        default: "border-border",
        success: "border-success-500/40 bg-success-500/5",
        error: "border-destructive-500/40 bg-destructive-500/5",
        warning: "border-warning-500/40 bg-warning-500/5",
        info: "border-accent/40 bg-accent/5",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

const iconClass = cva("size-4 shrink-0", {
  variants: {
    variant: {
      default: "text-fg-muted",
      success: "text-success-200",
      error: "text-destructive-300",
      warning: "text-warning-200",
      info: "text-accent",
    },
  },
  defaultVariants: { variant: "default" },
});

const ICONS: Record<ToastVariant, React.ComponentType<{ className?: string; strokeWidth?: number }> | null> = {
  default: null,
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

interface ToastRootProps {
  variant?: ToastVariant;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  duration?: number;
  className?: string;
  onOpenChange?: (open: boolean) => void;
}

const ToastRoot = ({
  variant = "default",
  title,
  description,
  action,
  className,
  duration,
  onOpenChange,
}: ToastRootProps): JSX.Element => {
  const Icon = ICONS[variant];
  return (
    <RadixToast.Root
      {...(duration !== undefined ? { duration } : {})}
      className={cn(toastVariants({ variant }), className)}
      {...(onOpenChange !== undefined ? { onOpenChange } : {})}
    >
      {Icon ? <Icon className={iconClass({ variant })} strokeWidth={1.75} /> : null}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <RadixToast.Title className="text-sm font-medium text-fg">{title}</RadixToast.Title>
        {description ? (
          <RadixToast.Description className="text-xs text-fg-muted">
            {description}
          </RadixToast.Description>
        ) : null}
      </div>
      {action ? (
        <RadixToast.Action
          asChild
          altText={action.label}
          onClick={action.onClick}
        >
          <button
            type="button"
            className="shrink-0 rounded-md border border-border-subtle px-2 py-1 text-xs font-medium text-fg-muted hover:border-accent/40 hover:bg-surface-elevated hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {action.label}
          </button>
        </RadixToast.Action>
      ) : null}
      <RadixToast.Close
        aria-label="Dismiss"
        className="absolute right-2 top-2 rounded-md p-1 text-fg-faint hover:bg-surface-elevated hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <X className="size-3.5" strokeWidth={1.75} />
      </RadixToast.Close>
    </RadixToast.Root>
  );
};

export const Toaster = (): JSX.Element => {
  const { toasts, dismiss } = useToast();
  return (
    <RadixToast.Provider swipeDirection="right">
      {toasts.map((t) => (
        <ToastRoot
          key={t.id}
          {...(t.variant !== undefined ? { variant: t.variant } : {})}
          title={t.title}
          {...(t.description !== undefined ? { description: t.description } : {})}
          {...(t.duration !== undefined ? { duration: t.duration } : {})}
          {...(t.action !== undefined ? { action: t.action } : {})}
          onOpenChange={(open) => {
            if (!open) dismiss(t.id);
          }}
        />
      ))}
      <RadixToast.Viewport
        className={cn(
          "pointer-events-none fixed z-[100] flex max-h-screen w-full flex-col-reverse gap-2 p-4 outline-none",
          "top-4 sm:top-auto sm:bottom-4 sm:right-4 sm:max-w-sm",
          "pt-[max(env(safe-area-inset-top),1rem)] sm:pt-0 sm:pb-[max(env(safe-area-inset-bottom),1rem)]",
        )}
      />
    </RadixToast.Provider>
  );
};
