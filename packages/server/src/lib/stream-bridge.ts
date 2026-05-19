import {
  createSdkMcpServer,
  query,
  type Options,
} from "@anthropic-ai/claude-agent-sdk";
import type { Lifecoach } from "@lifecoach/core";
import { buildAllTools } from "@lifecoach/core/agent";
import { buildSystemPrompt } from "@lifecoach/core/agent";

/**
 * Streams a chat turn from the Claude Agent SDK and yields events suitable
 * for serializing to the browser. We emit our own event shape (not the AI
 * SDK's data-stream protocol verbatim) — the web client uses TanStack Query
 * for non-streaming data and a thin fetch+ReadableStream reader for chat,
 * which gives us full control over what tool calls look like in the UI.
 *
 * Event types:
 *   { type: 'text-delta',  text }
 *   { type: 'tool-start',  toolUseId, name, input }
 *   { type: 'tool-result', toolUseId, output?, error? }
 *   { type: 'done',        toolCallCount }
 *   { type: 'error',       message }
 */
export type ChatEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-start"; toolUseId: string; name: string; input: unknown }
  | { type: "tool-result"; toolUseId: string; output?: unknown; error?: string }
  | { type: "done"; toolCallCount: number }
  | { type: "error"; message: string };

export interface ChatStreamInput {
  sessionId: string;
  userMessage: string;
}

export async function* streamChatTurn(
  lc: Lifecoach,
  input: ChatStreamInput,
): AsyncGenerator<ChatEvent> {
  const { memory, storage, embedder, extractor, todoist, reflector, config } = lc;

  // Persist the user turn before kicking off the agent.
  memory.episodic.appendMessage({
    sessionId: input.sessionId,
    role: "user",
    content: input.userMessage,
  });

  const tools = buildAllTools({ memory, storage, embedder, extractor, todoist, reflector });
  const mcpServer = createSdkMcpServer({
    name: "lifecoach-memory",
    version: "0.0.1",
    tools,
  });

  const systemPrompt = buildSystemPrompt(memory);
  const options: Options = {
    model: config.model,
    systemPrompt: { type: "preset", preset: "claude_code", append: systemPrompt },
    mcpServers: { "lifecoach-memory": mcpServer },
    permissionMode: "bypassPermissions",
    includePartialMessages: true,
  };

  let assistantText = "";
  let toolCallCount = 0;
  // Tracks whether the most recent event was a tool call (or its result). When
  // text resumes after that, we need to inject paragraph spacing — otherwise
  // the text block immediately preceding the tool ("Logging this…") concats
  // straight into the post-tool text block ("Got it — here's what…") with no
  // separator. The Anthropic SDK emits these as distinct content blocks, but
  // delta-level streaming doesn't expose the boundary.
  let pendingTextSeparator = false;

  try {
    for await (const event of query({ prompt: input.userMessage, options })) {
      if (event.type === "stream_event") {
        // Streaming text delta from the assistant.
        const delta = event.event;
        if (delta?.type === "content_block_delta" && delta.delta?.type === "text_delta") {
          let text = delta.delta.text ?? "";
          if (text.length > 0) {
            if (pendingTextSeparator) {
              // Only inject if the accumulated text doesn't already end in
              // whitespace and the incoming delta doesn't start with it.
              const needsSep =
                assistantText.length > 0 &&
                !/\s$/.test(assistantText) &&
                !/^\s/.test(text);
              if (needsSep) text = "\n\n" + text;
              pendingTextSeparator = false;
            }
            assistantText += text;
            yield { type: "text-delta", text };
          }
        }
        continue;
      }
      if (event.type === "assistant") {
        const blocks = event.message?.content ?? [];
        for (const block of blocks) {
          if (block.type === "tool_use") {
            toolCallCount += 1;
            // After a tool use, the next text block should be visually
            // separated from the prior text block.
            pendingTextSeparator = true;
            yield {
              type: "tool-start",
              toolUseId: block.id,
              name: block.name,
              input: block.input,
            };
          }
        }
        continue;
      }
      if (event.type === "user") {
        // Tool results come back as 'user' messages in the SDK protocol.
        const content = event.message?.content;
        const blocks = Array.isArray(content) ? content : [];
        for (const block of blocks) {
          if (typeof block !== "object" || block === null) continue;
          const b = block as {
            type?: string;
            tool_use_id?: string;
            content?: unknown;
            is_error?: boolean;
          };
          if (b.type !== "tool_result" || !b.tool_use_id) continue;
          const error = b.is_error ? extractErrorText(b.content) : undefined;
          yield {
            type: "tool-result",
            toolUseId: b.tool_use_id,
            ...(b.content !== undefined && !error ? { output: b.content } : {}),
            ...(error ? { error } : {}),
          };
        }
      }
    }
  } catch (err) {
    yield { type: "error", message: err instanceof Error ? err.message : String(err) };
    return;
  }

  // Persist the assistant turn.
  memory.episodic.appendMessage({
    sessionId: input.sessionId,
    role: "assistant",
    content: assistantText.trim(),
  });

  yield { type: "done", toolCallCount };
}

const extractErrorText = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === "string" ? c : c?.text ?? JSON.stringify(c)))
      .join("\n");
  }
  return JSON.stringify(content);
};
