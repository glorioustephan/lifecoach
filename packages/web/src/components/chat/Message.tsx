import { Leaf } from "lucide-react";
import { cn } from "~/lib/cn";
import { Markdown } from "./Markdown";
import { MessageActions } from "./MessageActions";

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
 *    Content is rendered through Markdown so the agent's lists/bold/code/etc render.
 *
 * Both roles get a copy-as-markdown action that hover-reveals on desktop and is
 * always present on touch.
 */
export const Message = ({ role, content, streaming, isRunStart = true }: Props): JSX.Element => {
  if (role === "user") {
    return (
      <div className="group ml-auto flex max-w-[80%] flex-col">
        <div
          className={cn(
            "rounded-xl rounded-br-sm border border-border bg-surface-elevated px-4 py-3",
            "text-sm leading-relaxed text-fg whitespace-pre-wrap",
          )}
        >
          {content}
        </div>
        <div className="mt-1 pr-1">
          <MessageActions content={content} align="right" />
        </div>
      </div>
    );
  }

  return (
    <div className="group flex max-w-[90%] gap-3">
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
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "border-l-2 pl-4 pr-2 py-1",
            streaming ? "border-neutral-600" : "border-accent",
          )}
        >
          {content.length > 0 ? (
            <Markdown>{content}</Markdown>
          ) : (
            // Empty during the brief moment before the first text delta lands;
            // the streaming cursor below conveys the state.
            <span aria-hidden />
          )}
          {streaming && (
            <span
              aria-hidden
              className="ml-0.5 inline-block animate-pulse align-baseline text-fg-faint"
            >
              ▍
            </span>
          )}
        </div>
        {!streaming && content.length > 0 && (
          <div className="mt-1 pl-4">
            <MessageActions content={content} />
          </div>
        )}
      </div>
    </div>
  );
};
