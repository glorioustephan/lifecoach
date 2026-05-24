import { cn } from "~/lib/cn";

type ButtonVariant = "primary" | "secondary" | "destructive" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-400 disabled:opacity-50",
  secondary:
    "border border-border-subtle text-fg-muted hover:border-accent/40 hover:bg-surface-elevated hover:text-fg disabled:opacity-50",
  destructive: "bg-destructive-500 text-bg hover:bg-destructive-600 disabled:opacity-50",
  ghost: "text-fg-muted hover:bg-surface-elevated/60 hover:text-fg disabled:opacity-50",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs font-medium",
  md: "px-3 py-2 text-sm font-medium",
  lg: "px-4 py-2.5 text-base font-medium",
};

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
      "inline-flex items-center justify-center rounded-md transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
      "disabled:cursor-not-allowed",
      variantStyles[variant],
      sizeStyles[size],
      className,
    )}
    {...props}
  >
    {loading ? (
      <>
        <svg className="mr-2 size-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
          <path
            fill="currentColor"
            d="M4 12a8 8 0 0 1 15.464-3.536l-2.828 2.828A6 6 0 1 0 12 4v8z"
          />
        </svg>
      </>
    ) : null}
    {children}
  </button>
);
