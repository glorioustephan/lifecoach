import { useCallback, useEffect, useRef, useState } from "react";
import { sendChat, type ChatEvent } from "~/lib/chat-stream";
import { useSetAgentState } from "./agent-state";
import { Message } from "./Message";
import { ToolCallDisclosure, type ToolCallState } from "./ToolCallDisclosure";
import { Composer } from "./Composer";

type ChatItem =
  | { kind: "message"; id: string; role: "user" | "assistant"; content: string; streaming?: boolean }
  | { kind: "tool"; id: string; state: ToolCallState };

interface Props {
  sessionId?: string;
  initialMessages?: Array<{ id: string; role: "user" | "assistant" | "system" | "tool"; content: string }>;
}

const newClientId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const ChatView = ({ sessionId, initialMessages }: Props): JSX.Element => {
  const setAgentState = useSetAgentState();
  const [items, setItems] = useState<ChatItem[]>(() =>
    (initialMessages ?? [])
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        kind: "message" as const,
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
  );
  const [streaming, setStreaming] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(sessionId);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Reset state when session changes via route navigation.
  useEffect(() => {
    setItems(
      (initialMessages ?? [])
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          kind: "message" as const,
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
    );
    setActiveSessionId(sessionId);
  }, [sessionId, initialMessages]);

  // Scroll to bottom on new content.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [items, streaming]);

  const handleSubmit = useCallback(
    async (text: string) => {
      if (streaming) return;
      const userId = newClientId();
      const assistantId = newClientId();
      setItems((prev) => [
        ...prev,
        { kind: "message", id: userId, role: "user", content: text },
        { kind: "message", id: assistantId, role: "assistant", content: "", streaming: true },
      ]);
      setStreaming(true);
      setAgentState("thinking");

      const onEvent = (event: ChatEvent): void => {
        if (event.type === "session" && !activeSessionId) {
          // Just track the session ID in component state. We intentionally do NOT
          // update the URL during streaming: any URL change (TanStack's navigate
          // OR history.replaceState) causes TanStack Router to remount the route
          // and lose the in-flight stream's React state. We'll update the URL
          // on the "done" event instead, where it's safe to re-mount because
          // the assistant message is now persisted server-side.
          setActiveSessionId(event.sessionId);
          return;
        }
        if (event.type === "text-delta") {
          setItems((prev) =>
            prev.map((it) =>
              it.kind === "message" && it.id === assistantId
                ? { ...it, content: it.content + event.text }
                : it,
            ),
          );
          return;
        }
        if (event.type === "tool-start") {
          setAgentState("tool");
          const tool: ToolCallState = {
            toolUseId: event.toolUseId,
            name: event.name,
            input: event.input,
            status: "running",
            startedAt: Date.now(),
          };
          // Insert before the streaming assistant message.
          setItems((prev) => {
            const next = [...prev];
            const idx = next.findIndex(
              (it) => it.kind === "message" && it.id === assistantId,
            );
            const toolItem: ChatItem = { kind: "tool", id: event.toolUseId, state: tool };
            if (idx === -1) next.push(toolItem);
            else next.splice(idx, 0, toolItem);
            return next;
          });
          return;
        }
        if (event.type === "tool-result") {
          setAgentState("thinking");
          setItems((prev) =>
            prev.map((it) =>
              it.kind === "tool" && it.state.toolUseId === event.toolUseId
                ? {
                    ...it,
                    state: {
                      ...it.state,
                      status: event.error ? "error" : "complete",
                      ...(event.error ? { error: event.error } : {}),
                      ...(event.output !== undefined ? { output: event.output } : {}),
                      finishedAt: Date.now(),
                    },
                  }
                : it,
            ),
          );
          return;
        }
        if (event.type === "done") {
          setItems((prev) =>
            prev.map((it) =>
              it.kind === "message" && it.id === assistantId
                ? { ...it, streaming: false }
                : it,
            ),
          );
          return;
        }
        if (event.type === "error") {
          setItems((prev) =>
            prev.map((it) =>
              it.kind === "message" && it.id === assistantId
                ? {
                    ...it,
                    content: it.content + `\n\n[error: ${event.message}]`,
                    streaming: false,
                  }
                : it,
            ),
          );
        }
      };

      try {
        await sendChat({
          message: text,
          ...(activeSessionId ? { sessionId: activeSessionId } : {}),
          onEvent,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setItems((prev) =>
          prev.map((it) =>
            it.kind === "message" && it.id === assistantId
              ? { ...it, content: it.content + `\n\n[error: ${message}]`, streaming: false }
              : it,
          ),
        );
      } finally {
        setStreaming(false);
        setAgentState("idle");
      }
    },
    [streaming, activeSessionId, setAgentState],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 items-center justify-between border-b border-border px-4">
        <h1 className="text-sm font-medium text-fg-muted">
          {activeSessionId ? "Conversation" : "New conversation"}
        </h1>
      </header>

      <div
        ref={scrollerRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className="flex-1 overflow-y-auto"
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pb-6 pt-6">
          {items.length === 0 && (
            <div className="mt-12 flex flex-col items-center gap-2 text-center">
              <div className="text-sm text-fg-muted">Good morning, James.</div>
              <div className="max-w-sm text-xs text-fg-faint">
                Type below to start a new conversation, or ask the coach what they noticed.
              </div>
            </div>
          )}
          {items.map((item) => {
            if (item.kind === "message") {
              return (
                <Message
                  key={item.id}
                  role={item.role}
                  content={item.content}
                  streaming={item.streaming === true}
                />
              );
            }
            return (
              <div key={item.id} className="ml-10">
                <ToolCallDisclosure call={item.state} />
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-border-subtle bg-bg pt-2">
        <Composer onSubmit={handleSubmit} disabled={streaming} />
      </div>
    </div>
  );
};
