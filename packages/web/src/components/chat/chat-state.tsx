import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ToolCallState } from "./ToolCallDisclosure";
import type { ToolUseCapture } from "~/lib/chat-stream";

export type ChatItem =
  | {
      kind: "message";
      id: string;
      role: "user" | "assistant";
      content: string;
      streaming?: boolean;
      /** Populated for assistant messages that called propose_artifact or propose_actionable_items. */
      toolUse?: ToolUseCapture;
    }
  | { kind: "tool"; id: string; state: ToolCallState }
  | { kind: "error"; id: string; message: string };

interface ChatState {
  sessionId: string | undefined;
  items: ChatItem[];
  streaming: boolean;
  /**
   * Text queued to be submitted as the next user turn the moment ChatView
   * mounts/observes it. Used by entry points outside the chat view (e.g.
   * Insight "Discuss") so the seed prompt actually reaches the backend
   * instead of only sitting in client state.
   */
  pendingSubmit: string | undefined;
}

interface ChatActions {
  /** Replace the entire chat state — used when loading a specific session by URL. */
  reset: (next: {
    sessionId: string | undefined;
    items: ChatItem[];
    pendingSubmit?: string;
  }) => void;
  /** Append items at the end (e.g. user message + assistant placeholder on submit). */
  append: (items: ChatItem[]) => void;
  /** Update items via a reducer. Use for streaming text appends, tool state changes, etc. */
  update: (fn: (items: ChatItem[]) => ChatItem[]) => void;
  setSessionId: (id: string | undefined) => void;
  setStreaming: (s: boolean) => void;
  clearPendingSubmit: () => void;
}

const StateCtx = createContext<ChatState | null>(null);
const ActionsCtx = createContext<ChatActions | null>(null);

/**
 * Lives at the router root. The root component never unmounts on route
 * changes, so this context preserves chat state when the user navigates
 * to Memory / Inbox / Tasks / etc. and returns to Chat.
 */
export const ChatStateProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState<string | undefined>(undefined);

  // Stable refs for setters so the actions object doesn't change identity.
  const setItemsRef = useRef(setItems);
  setItemsRef.current = setItems;

  const reset = useCallback(
    (next: {
      sessionId: string | undefined;
      items: ChatItem[];
      pendingSubmit?: string;
    }) => {
      setSessionId(next.sessionId);
      setItems(next.items);
      setStreaming(false);
      setPendingSubmit(next.pendingSubmit);
    },
    [],
  );
  const append = useCallback((newItems: ChatItem[]) => {
    setItemsRef.current((prev) => [...prev, ...newItems]);
  }, []);
  const update = useCallback((fn: (items: ChatItem[]) => ChatItem[]) => {
    setItemsRef.current((prev) => fn(prev));
  }, []);
  const clearPendingSubmit = useCallback(() => {
    setPendingSubmit(undefined);
  }, []);

  const state = useMemo<ChatState>(
    () => ({ sessionId, items, streaming, pendingSubmit }),
    [sessionId, items, streaming, pendingSubmit],
  );
  const actions = useMemo<ChatActions>(
    () => ({
      reset,
      append,
      update,
      setSessionId,
      setStreaming,
      clearPendingSubmit,
    }),
    [reset, append, update, clearPendingSubmit],
  );

  return (
    <StateCtx.Provider value={state}>
      <ActionsCtx.Provider value={actions}>{children}</ActionsCtx.Provider>
    </StateCtx.Provider>
  );
};

export const useChatState = (): ChatState => {
  const ctx = useContext(StateCtx);
  if (!ctx) throw new Error("useChatState must be used inside ChatStateProvider");
  return ctx;
};

export const useChatActions = (): ChatActions => {
  const ctx = useContext(ActionsCtx);
  if (!ctx) throw new Error("useChatActions must be used inside ChatStateProvider");
  return ctx;
};
