import { Button } from "@/components/ui/Button"
import { cn } from "@/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"
import { AlertCircle, AlertTriangle, Info } from "lucide-react"
import React from "react"

/* Retoned to semantic tokens per ui-design-system §2.2.
   All raw palette values (zinc-*, red-*, amber-*, dark:*) replaced with
   lifecoach semantic aliases so dark/light parity is preserved. */
const systemMessageVariants = cva(
  "flex flex-row items-center gap-3 rounded-[12px] border py-2 pr-2 pl-3",
  {
    variants: {
      variant: {
        action: "text-fg-muted",
        error: "text-destructive-300",
        warning: "text-warning-500",
      },
      fill: {
        true: "bg-background",
        false: "",
      },
    },
    compoundVariants: [
      {
        variant: "action",
        fill: true,
        class: "bg-surface border-transparent",
      },
      {
        variant: "error",
        fill: true,
        class: "bg-destructive-100/20 border-transparent",
      },
      {
        variant: "warning",
        fill: true,
        class: "bg-warning-200/20 border-transparent",
      },
      {
        variant: "action",
        fill: false,
        class: "border-border-subtle",
      },
      {
        variant: "error",
        fill: false,
        class: "border-destructive-500/50",
      },
      {
        variant: "warning",
        fill: false,
        class: "border-warning-500/50",
      },
    ],
    defaultVariants: {
      variant: "action",
      fill: false,
    },
  }
)

export type SystemMessageProps = React.ComponentProps<"div"> &
  VariantProps<typeof systemMessageVariants> & {
    icon?: React.ReactNode
    isIconHidden?: boolean
    cta?: {
      label: string
      onClick?: () => void
      variant?: "solid" | "outline" | "ghost"
    }
  }

export function SystemMessage({
  children,
  variant = "action",
  fill = false,
  icon,
  isIconHidden = false,
  cta,
  className,
  ...props
}: SystemMessageProps) {
  const getDefaultIcon = () => {
    if (isIconHidden) return null

    switch (variant) {
      case "error":
        return <AlertCircle className="size-4" />
      case "warning":
        return <AlertTriangle className="size-4" />
      default:
        return <Info className="size-4" />
    }
  }

  const getIconToShow = () => {
    if (isIconHidden) return null
    if (icon) return icon
    return getDefaultIcon()
  }

  const shouldShowIcon = getIconToShow() !== null

  return (
    <div
      className={cn(systemMessageVariants({ variant, fill }), className)}
      {...props}
    >
      <div className="flex flex-1 flex-row items-center gap-3 leading-normal">
        {shouldShowIcon && (
          <div className="flex h-[1lh] shrink-0 items-center justify-center self-start">
            {getIconToShow()}
          </div>
        )}

        <div
          className={cn(
            "flex min-w-0 flex-1 items-center",
            shouldShowIcon ? "gap-3" : "gap-0"
          )}
        >
          <div className="text-sm">{children}</div>
        </div>
      </div>

      {cta && (
        <Button variant="secondary" size="sm" onClick={cta.onClick}>
          {cta.label}
        </Button>
      )}
    </div>
  )
}
