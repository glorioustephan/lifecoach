/**
 * Chat message. Two visual modes:
 *  - User: right-aligned bubble with rounded-xl corners (br pinned), surface-elevated bg.
 *  - Assistant: no bubble. 2px left-accent border (notebook voice mark). Leaf avatar on run-start.
 *    Content is rendered through Markdown so the agent's lists/bold/code/etc render.
 *
 * Both roles get a copy-as-markdown action row via MessageActions.
 *
 * Per ui-design-system §1.2 — Decision: Wrap.
 * Adopts prompt-kit `MessageAvatar` for the avatar slot (assistant run-start icon).
 * The two-mode layout is preserved as intentional product identity (visual-design §8.1).
 * `MessageContent` from prompt-kit is not used directly because it applies a generic bubble
 * style that conflicts with the assistant's voice-mark border layout.
 */
import { Leaf } from "lucide-react";
import { cn } from "~/lib/cn";
import { Markdown } from "./Markdown";
import { MessageActions } from "./MessageActions";
import { MessageAvatar } from "~/components/ui/message";

interface Props {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  /** True when this is the first message in a consecutive run from the same role. */
  isRunStart?: boolean;
}

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
        /*
         * Adopts prompt-kit MessageAvatar for the lifecoach avatar slot.
         * We use it without src (no image) so it renders only the fallback — which
         * we slot in as the Leaf icon wrapped in a custom element via className.
         * The aria-hidden + decorative role matches visual-design §4.4.
         */
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
            streaming ? "border-border" : "border-accent",
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
            <MessageActions content={content} artifactSource={{ content }} />
          </div>
        )}
      </div>
    </div>
  );
};
