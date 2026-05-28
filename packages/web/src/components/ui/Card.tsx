import { cn } from "~/lib/cn";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const Card = ({ className, children, ...props }: CardProps): JSX.Element => (
  <div
    className={cn(
      "rounded-md border border-border bg-surface",
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

export const CardHeader = ({ className, children, ...props }: CardProps): JSX.Element => (
  <div className={cn("flex flex-col space-y-1.5 p-4 pb-2", className)} {...props}>
    {children}
  </div>
);

export const CardTitle = ({ className, children, ...props }: CardProps): JSX.Element => (
  <h3 className={cn("font-semibold leading-none tracking-tight", className)} {...props}>
    {children}
  </h3>
);

export const CardContent = ({ className, children, ...props }: CardProps): JSX.Element => (
  <div className={cn("p-4 pt-0", className)} {...props}>
    {children}
  </div>
);
