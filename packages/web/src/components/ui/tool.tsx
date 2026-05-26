/* prompt-kit Tool — retoned to semantic tokens per ui-design-system §2.2.
   All raw palette values (blue-*, orange-*, green-*, red-*, gray-*, dark:*)
   replaced with lifecoach semantic aliases. */
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import {
  CheckCircle,
  ChevronDown,
  Loader2,
  Settings,
  XCircle,
} from "lucide-react"
import { useState } from "react"

export type ToolPart = {
  type: string
  state:
    | "input-streaming"
    | "input-available"
    | "output-available"
    | "output-error"
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  toolCallId?: string
  errorText?: string
}

export type ToolProps = {
  toolPart: ToolPart
  defaultOpen?: boolean
  className?: string
}

const Tool = ({ toolPart, defaultOpen = false, className }: ToolProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  const { state, input, output, toolCallId } = toolPart

  const getStateIcon = () => {
    switch (state) {
      case "input-streaming":
        return <Loader2 className="h-4 w-4 animate-spin text-accent" />
      case "input-available":
        return <Settings className="h-4 w-4 text-warning-500" />
      case "output-available":
        return <CheckCircle className="h-4 w-4 text-success-500" />
      case "output-error":
        return <XCircle className="h-4 w-4 text-destructive-500" />
      default:
        return <Settings className="text-fg-muted h-4 w-4" />
    }
  }

  const getStateBadge = () => {
    const baseClasses = "px-2 py-1 rounded-full text-xs font-medium"
    switch (state) {
      case "input-streaming":
        return (
          <span className={cn(baseClasses, "bg-accent/10 text-accent")}>
            Processing
          </span>
        )
      case "input-available":
        return (
          <span className={cn(baseClasses, "bg-warning-200/20 text-warning-500")}>
            Ready
          </span>
        )
      case "output-available":
        return (
          <span className={cn(baseClasses, "bg-success-200/20 text-success-500")}>
            Completed
          </span>
        )
      case "output-error":
        return (
          <span className={cn(baseClasses, "bg-destructive-100/20 text-destructive-300")}>
            Error
          </span>
        )
      default:
        return (
          <span className={cn(baseClasses, "bg-surface-elevated text-fg-muted")}>
            Pending
          </span>
        )
    }
  }

  const formatValue = (value: unknown): string => {
    if (value === null) return "null"
    if (value === undefined) return "undefined"
    if (typeof value === "string") return value
    if (typeof value === "object") {
      return JSON.stringify(value, null, 2)
    }
    return String(value)
  }

  return (
    <div
      className={cn(
        "border-border mt-3 overflow-hidden rounded-lg border",
        className
      )}
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger
          className="bg-surface flex h-auto w-full cursor-pointer items-center justify-between rounded-b-none px-3 py-2 font-normal transition-colors hover:bg-surface-elevated"
        >
          <div className="flex items-center gap-2">
            {getStateIcon()}
            <span className="font-mono text-sm font-medium text-fg">
              {toolPart.type}
            </span>
            {getStateBadge()}
          </div>
          <ChevronDown className={cn("h-4 w-4 text-fg-muted transition-transform", isOpen && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent
          className={cn(
            "border-border border-t",
            "data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden"
          )}
        >
          <div className="bg-surface space-y-3 p-3">
            {input && Object.keys(input).length > 0 && (
              <div>
                <h4 className="text-fg-muted mb-2 text-xs font-mono uppercase tracking-wide">
                  Input
                </h4>
                <div className="bg-bg rounded border border-border p-2 font-mono text-xs">
                  {Object.entries(input).map(([key, value]) => (
                    <div key={key} className="mb-1">
                      <span className="text-fg-faint">{key}:</span>{" "}
                      <span className="text-fg-muted">{formatValue(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {output && (
              <div>
                <h4 className="text-fg-muted mb-2 text-xs font-mono uppercase tracking-wide">
                  Output
                </h4>
                <div className="bg-bg max-h-60 overflow-auto rounded border border-border p-2 font-mono text-xs">
                  <pre className="whitespace-pre-wrap text-fg-muted">
                    {formatValue(output)}
                  </pre>
                </div>
              </div>
            )}

            {state === "output-error" && toolPart.errorText && (
              <div>
                <h4 className="mb-2 text-xs font-mono uppercase tracking-wide text-destructive-300">Error</h4>
                <div className="bg-bg rounded border border-destructive-500/50 p-2 text-sm text-destructive-300">
                  {toolPart.errorText}
                </div>
              </div>
            )}

            {state === "input-streaming" && (
              <div className="text-fg-muted text-sm">
                Processing tool call...
              </div>
            )}

            {toolCallId && (
              <div className="text-fg-faint border-t border-border pt-2 text-xs">
                <span className="font-mono">Call ID: {toolCallId}</span>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

export { Tool }
