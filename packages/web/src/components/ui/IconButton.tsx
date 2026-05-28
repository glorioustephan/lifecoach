import { cn } from "~/lib/cn";

type IconButtonVariant = "default" | "primary" | "destructive" | "success";
type IconButtonSize = "sm" | "md" | "lg";

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  loading?: boolean;
  children: React.ReactNode;
}

const variantStyles: Record<IconButtonVariant, string> = {
  default: "text-fg-muted hover:bg-surface-elevated/60 hover:text-fg disabled:opacity-50",
  primary: "bg-accent text-accent-fg hover:bg-accent-400 disabled:opacity-50",
  destructive: "text-fg-muted hover:bg-destructive-500/10 hover:text-destructive-300 disabled:opacity-50",
  success: "text-fg-muted hover:bg-success-500/10 hover:text-success-300 disabled:opacity-50",
};

const sizeStyles: Record<IconButtonSize, string> = {
  sm: "size-11",
  md: "size-11",
  lg: "size-12",
};

export const IconButton = ({
  variant = "default",
  size = "md",
  loading = false,
  disabled = false,
  className,
  children,
  ...props
}: IconButtonProps): JSX.Element => (
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
    {children}
  </button>
);
