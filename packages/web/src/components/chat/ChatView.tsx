import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Menu, Plus } from "lucide-react";
import { sendChat, type ChatEvent } from "~/lib/chat-stream";
import { useProfileName } from "~/lib/use-profile";
import { getGreeting } from "~/lib/greeting";
import { useSetAgentState } from "./agent-state";
import { Message } from "./Message";
import { ToolCallDisclosure, type ToolCallState } from "./ToolCallDisclosure";
import { ThinkingBar } from "./ThinkingBar";
import { SystemMessage } from "~/components/ui/system-message";
import { Composer } from "./Composer";
import { useChatActions, useChatState, type ChatItem } from "./chat-state";
import { SessionListSheet } from "./SessionListSheet";
import {
  ChatContainerRoot,
  ChatContainerContent,
  ChatContainerScrollAnchor,
} from "~/components/ui/chat-container";
import { ScrollButton } from "~/components/ui/scroll-button";
import { PromptSuggestion } from "~/components/ui/prompt-suggestion";

interface Props {
  /** When set, this ChatView is bound to a specific session (the /c/$id route).
   *  On mount it resets the shared chat state to this session's loaded messages. */
  sessionId?: string;
  initialMessages?: Array<{
    id: string;
    role: "user" | "assistant" | "system" | "tool";
    content: string;
  }>;
}

const newClientId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const ChatView = ({ sessionId, initialMessages }: Props): JSX.Element => {
  const setAgentState = useSetAgentState();
  const navigate = useNavigate();
  const profileName = useProfileName();
  const { items, streaming, sessionId: ctxSessionId } = useChatState();
  const { reset, append, update, setSessionId, setStreaming } = useChatActions();
  const [historyOpen, setHistoryOpen] = useState(false);
  const greeting = useMemo(() => getGreeting(profileName ?? undefined), [profileName]);
  // AbortController for the active SSE stream. Replaced each submission.
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleStop = useCallback((): void => {
    abortControllerRef.current?.abort();
  }, []);

  const handleNewConversation = useCallback((): void => {
    reset({ sessionId: undefined, items: [] });
    if (sessionId) {
      // We were on /c/$id — navigate home so the URL no longer pins us to
      // the old session. State is already cleared in context.
      void navigate({ to: "/" });
    }
  }, [reset, sessionId, navigate]);

  // When the route hands us a specific session that differs from the one in
  // context, replace context with the loaded messages. (No-op when we're on
  // the fresh-session route — props are undefined and we keep ctx state.)
  useEffect(() => {
    if (!sessionId) return;
    if (sessionId === ctxSessionId) return;
    reset({
      sessionId,
      items: (initialMessages ?? [])
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          kind: "message",
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
    });
  }, [sessionId, initialMessages, ctxSessionId, reset]);

  const handleSubmit = useCallback(
    async (text: string) => {
      if (streaming) return;
      const userId = newClientId();
      const assistantId = newClientId();
      append([
        { kind: "message", id: userId, role: "user", content: text },
        { kind: "message", id: assistantId, role: "assistant", content: "", streaming: true },
      ]);
      setStreaming(true);
      setAgentState("thinking");

      const onEvent = (event: ChatEvent): void => {
        if (event.type === "session" && !ctxSessionId) {
          // Server-assigned session ID for a fresh conversation. Stored in
          // context so subsequent turns continue the same session. We do NOT
          // touch the URL here — that would cause TanStack Router to remount
          // and lose the in-flight stream.
          setSessionId(event.sessionId);
          return;
        }
        if (event.type === "text-delta") {
          update((prev) =>
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
          update((prev) => {
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
          update((prev) =>
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
          update((prev) =>
            prev.map((it) =>
              it.kind === "message" && it.id === assistantId
                ? { ...it, streaming: false }
                : it,
            ),
          );
          return;
        }
        if (event.type === "error") {
          update((prev) => {
            // Mark the assistant message as done (stop streaming cursor).
            const next = prev.map((it) =>
              it.kind === "message" && it.id === assistantId
                ? { ...it, streaming: false }
                : it,
            );
            // Append a SystemMessage error item after the assistant message.
            return [
              ...next,
              { kind: "error" as const, id: `err-${assistantId}`, message: event.message },
            ];
          });
        }
      };

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        await sendChat({
          message: text,
          ...(ctxSessionId ? { sessionId: ctxSessionId } : {}),
          signal: controller.signal,
          onEvent,
        });
      } catch (err) {
        // AbortError is expected when the user clicks Stop — suppress it.
        if (err instanceof Error && err.name === "AbortError") {
          update((prev) =>
            prev.map((it) =>
              it.kind === "message" && it.id === assistantId
                ? { ...it, streaming: false }
                : it,
            ),
          );
        } else {
          const message = err instanceof Error ? err.message : String(err);
          update((prev) => {
            const next = prev.map((it) =>
              it.kind === "message" && it.id === assistantId
                ? { ...it, streaming: false }
                : it,
            );
            return [
              ...next,
              { kind: "error" as const, id: `err-${assistantId}`, message },
            ];
          });
        }
      } finally {
        setStreaming(false);
        setAgentState("idle");
      }
    },
    [streaming, ctxSessionId, append, update, setSessionId, setStreaming, setAgentState],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="relative flex h-12 items-center justify-between border-b border-border px-4">
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          aria-label="Open conversation history"
          className="flex size-9 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-elevated hover:text-fg"
        >
          <Menu className="size-4" strokeWidth={1.75} />
        </button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-sm font-medium text-fg-muted">
          {ctxSessionId ? "Conversation" : "New conversation"}
        </h1>
        <button
          type="button"
          onClick={handleNewConversation}
          aria-label="New conversation"
          className="flex h-9 items-center gap-1 rounded-md px-2.5 text-xs text-fg-muted transition-colors hover:bg-surface-elevated hover:text-fg"
        >
          <Plus className="size-4" strokeWidth={1.75} />
          <span className="hidden md:inline">New</span>
        </button>
      </header>

      <SessionListSheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        {...(ctxSessionId ? { activeSessionId: ctxSessionId } : {})}
      />

      {/*
       * ChatContainerRoot wraps use-stick-to-bottom's StickToBottom, which provides:
       *   - Automatic scroll-to-bottom during streaming.
       *   - User-scroll-pauses-autoscroll (fixes the fight-during-streaming bug).
       *   - useStickToBottomContext() for ScrollButton visibility.
       *
       * ScrollButton lives inside ChatContainerRoot so it can access the context.
       * It is positioned absolutely over the chat list so it floats at the bottom.
       *
       * aria role="log" / aria-live="polite" / aria-label preserved from the
       * original ChatView scroller for screen reader continuity (§4.4).
       */}
      <div className="relative flex-1 min-h-0">
        <ChatContainerRoot
          className="relative h-full flex-col"
          aria-live="polite"
          aria-label="Conversation"
        >
          <ChatContainerContent>
            <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pb-6 pt-6 mobile-safe-bottom">
              {items.length === 0 && (
                <div className="mt-12 flex flex-col items-center gap-4 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="text-sm text-fg-muted">{greeting}</div>
                    <div className="max-w-sm text-xs text-fg-faint">
                      Type below to start a new conversation, or ask the coach what they
                      noticed.
                    </div>
                  </div>
                  {/* Starter suggestion chips — PromptSuggestion (Tier 3, §1.3).
                      Calls handleSubmit directly so chips submit immediately. */}
                  <div className="flex flex-wrap justify-center gap-2">
                    {[
                      "What should I focus on today?",
                      "How am I tracking this week?",
                      "What patterns have you noticed?",
                      "Help me plan my next steps.",
                    ].map((prompt) => (
                      <PromptSuggestion
                        key={prompt}
                        onClick={() => handleSubmit(prompt)}
                        disabled={streaming}
                      >
                        {prompt}
                      </PromptSuggestion>
                    ))}
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
                if (item.kind === "error") {
                  return (
                    <div key={item.id} className="ml-10">
                      <SystemMessage variant="error">
                        {item.message}
                      </SystemMessage>
                    </div>
                  );
                }
                return (
                  <div key={item.id} className="ml-10">
                    <ToolCallDisclosure call={item.state} />
                  </div>
                );
              })}
              {/* ThinkingBar — visible while agent is not idle. Bound to
                  agent-state context; stop button triggers SSE abort. */}
              <ThinkingBar onStop={handleStop} />
            </div>
            <ChatContainerScrollAnchor />
          </ChatContainerContent>

          {/* Floating scroll-to-bottom button — MUST be a child of
              ChatContainerRoot so ScrollButton can read use-stick-to-bottom
              context (rendering it outside the root crashes the whole view).
              The root is `relative`, so this floats at the bottom over the list.
              Retoned to bg-surface-elevated per ui-design-system §2.2 (teal hover too loud). */}
          <div className="pointer-events-none absolute bottom-4 left-0 right-0 flex justify-center">
            <div className="pointer-events-auto">
              <ScrollButton
                className="bg-surface-elevated text-fg-muted hover:bg-surface hover:text-fg border border-border shadow-sm"
                aria-label="Scroll to latest message"
              />
            </div>
          </div>
        </ChatContainerRoot>
      </div>

      <div className="border-t border-border-subtle bg-bg pt-2">
        <Composer onSubmit={handleSubmit} disabled={streaming} />
      </div>
    </div>
  );
};
