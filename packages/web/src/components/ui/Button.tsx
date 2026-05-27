/**
 * Button — MERGED dual-export.
 *
 * Exports BOTH:
 *   1. `buttonVariants` — CVA function (shadcn-compatible API). Used by
 *      prompt-kit components (prompt-suggestion, scroll-button) for variant/size
 *      type inference. Maps shadcn variant names to lifecoach semantic tokens.
 *   2. `Button` — lifecoach component (forwardRef, semantic-token variants,
 *      loading prop, focus ring). The public button for all app code.
 *
 * RULE: Never let `npx shadcn add button` overwrite this file.
 * If it does: git checkout HEAD -- packages/web/src/components/ui/Button.tsx
 */
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~/lib/cn";
import { CircularLoader } from "./loader";

/* ── shadcn-compatible buttonVariants (used by prompt-kit for TS types) ── */
export const buttonVariants = cva(
  cn(
    "inline-flex items-center justify-center gap-1.5 rounded-md transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
    "disabled:cursor-not-allowed disabled:opacity-50",
  ),
  {
    variants: {
      variant: {
        default:   "bg-accent text-accent-fg hover:bg-accent-400",
        primary:   "bg-accent text-accent-fg hover:bg-accent-400",
        secondary: "border border-border-subtle text-fg-muted hover:border-accent/40 hover:bg-surface-elevated hover:text-fg",
        destructive: "bg-destructive-500 text-bg hover:bg-destructive-300",
        outline:   "border border-border-subtle text-fg-muted hover:bg-surface-elevated hover:text-fg",
        ghost:     "text-fg-muted hover:bg-surface-elevated/60 hover:text-fg",
        link:      "text-accent underline-offset-4 hover:underline",
      },
      size: {
        default: "px-3 py-2 text-sm font-medium",
        sm:      "px-3 py-1.5 text-xs font-medium",
        md:      "px-3 py-2 text-sm font-medium",
        lg:      "px-4 py-2.5 text-base font-medium",
        icon:    "size-9",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  },
);

/* ── Lifecoach Button component ── */
type ButtonVariant = "primary" | "secondary" | "destructive" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant | VariantProps<typeof buttonVariants>["variant"];
  size?: ButtonSize | VariantProps<typeof buttonVariants>["size"];
  loading?: boolean;
  children: React.ReactNode;
}

export const Button = ({
  variant = "secondary",
  size = "md",
  loading = false,
  disabled = false,
  className,
  children,
  ...props
}: ButtonProps): JSX.Element => (
  <button
    type="button"
    disabled={disabled || loading}
    className={cn(
      buttonVariants({
        variant: variant as VariantProps<typeof buttonVariants>["variant"],
        size: size as VariantProps<typeof buttonVariants>["size"],
      }),
      className,
    )}
    {...props}
  >
    {loading ? <CircularLoader size="sm" className="border-current border-t-transparent" /> : null}
    {children}
  </button>
);
