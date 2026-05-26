/* ThinkingBar — manually authored per prompt-kit spec (registry resolution failed
   for this component because it depends on text-shimmer which is not in the shadcn
   upstream registry). This is a faithful reproduction of the prompt-kit ThinkingBar
   API with lifecycle semantic tokens applied from the start.

   API matches the prompt-kit spec:
   - children: custom label (default: "Thinking")
   - isThinking: whether to show the bar (controls visibility)
   - onStop: optional callback for the stop action (SSE abort)
*/
import { Square } from "lucide-react"
import { cn } from "@/lib/utils"
import { TextShimmer } from "@/components/ui/text-shimmer"

export type ThinkingBarProps = {
  children?: React.ReactNode
  isThinking?: boolean
  onStop?: () => void
  className?: string
}

export function ThinkingBar({
  children = "Thinking",
  isThinking = true,
  onStop,
  className,
}: ThinkingBarProps) {
  if (!isThinking) return null

  return (
    <div
      className={cn(
        "flex items-center gap-2 py-1.5",
        className,
      )}
    >
      <TextShimmer
        as="span"
        duration={2}
        spread={25}
        className="text-sm font-medium"
      >
        {children as string}
      </TextShimmer>

      {onStop && (
        <button
          type="button"
          onClick={onStop}
          aria-label="Stop generating"
          className={cn(
            "ml-auto flex size-6 items-center justify-center rounded-md",
            "text-fg-muted transition-colors hover:bg-surface-elevated hover:text-fg",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
          )}
        >
          <Square className="size-3 fill-current" strokeWidth={0} aria-hidden />
        </button>
      )}
    </div>
  )
}
