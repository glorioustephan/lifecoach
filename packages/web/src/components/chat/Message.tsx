import { Leaf } from "lucide-react";
import { cn } from "~/lib/cn";

interface Props {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  /** True when this is the first message in a consecutive run from the same role. */
  isRunStart?: boolean;
}

/**
 * Chat message. Two visual modes:
 *  - User: right-aligned bubble with rounded-xl corners (br pinned), surface-elevated bg.
 *  - Assistant: no bubble. 2px left-accent border (notebook voice mark). Avatar leaf icon only on run-start.
 *
 * Implementation note: we don't use prompt-kit's <Message> component here — its
 * default treatment is bubble-on-both-sides, and overriding it to lose the bubble
 * on the assistant side is more friction than just composing the primitives ourselves.
 */
export const Message = ({ role, content, streaming, isRunStart = true }: Props): JSX.Element => {
  if (role === "user") {
    return (
      <div className="ml-auto flex max-w-[80%] flex-col">
        <div
          className={cn(
            "rounded-xl rounded-br-sm border border-border bg-surface-elevated px-4 py-3",
            "text-sm leading-relaxed text-fg",
          )}
        >
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-w-[90%] gap-3">
      {isRunStart ? (
        <div
          aria-hidden
          className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/10"
        >
          <Leaf className="size-4 text-accent" strokeWidth={1.75} />
        </div>
      ) : (
        <div aria-hidden className="w-7 shrink-0" />
      )}
      <div
        className={cn(
          "border-l-2 pl-4 pr-2 py-1",
          streaming ? "border-neutral-600" : "border-accent",
          "text-sm leading-relaxed text-fg whitespace-pre-wrap",
        )}
      >
        {content}
        {streaming && <span className="ml-1 inline-block animate-pulse text-fg-faint">▍</span>}
      </div>
    </div>
  );
};
