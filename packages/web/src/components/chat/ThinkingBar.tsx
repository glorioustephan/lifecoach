/**
 * ThinkingBar — in-stream "agent is thinking" indicator.
 *
 * Wraps prompt-kit's ThinkingBar (ui/thinking-bar.tsx) and wires it to:
 *   - `useAgentState()` — shows when agent is "thinking" or "tool" (not "idle").
 *   - `onStop` prop — passed through to the SSE abort callback so the stop
 *     button in the bar triggers the stream cancellation from ChatView.
 *
 * Per ui-design-system §1.3 — Decision: Wrap.
 * GlobalStatus still shows the ambient rail glow (unchanged); this bar is the
 * in-stream indicator that lives inline in the chat message list.
 */
import { useAgentState } from "./agent-state";
import { ThinkingBar as ThinkingBarPrimitive } from "~/components/ui/thinking-bar";

interface Props {
  /** SSE abort callback — passed to the stop button inside the bar. */
  onStop?: () => void;
}

export const ThinkingBar = ({ onStop }: Props): JSX.Element | null => {
  const agentState = useAgentState();
  const isThinking = agentState === "thinking";
  const isTool = agentState === "tool";

  if (agentState === "idle") return null;

  return (
    <div className="ml-10 px-4 py-1">
      <ThinkingBarPrimitive
        isThinking={isThinking || isTool}
        onStop={onStop}
      >
        {isTool ? "Running tool" : "Thinking"}
      </ThinkingBarPrimitive>
    </div>
  );
};
