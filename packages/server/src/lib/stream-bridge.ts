import {
  createSdkMcpServer,
  query,
  type Options,
} from "@anthropic-ai/claude-agent-sdk";
import type { Lifecoach } from "@lifecoach/core";
import { buildAllTools } from "@lifecoach/core/agent";
import { buildSystemPrompt } from "@lifecoach/core/agent";
import { buildMcpServers } from "@lifecoach/core/agent";

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
export type ToolUseCapture = {
  name: string;
  input?: Record<string, unknown>;
  output?: string;
};

export type ChatEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-start"; toolUseId: string; name: string; input: unknown }
  | { type: "tool-result"; toolUseId: string; output?: unknown; error?: string }
  | { type: "done"; toolCallCount: number; toolUse?: ToolUseCapture }
  | { type: "error"; message: string };

export interface ChatStreamInput {
  sessionId: string;
  userMessage: string;
}

export async function* streamChatTurn(
  lc: Lifecoach,
  input: ChatStreamInput,
): AsyncGenerator<ChatEvent> {
  const { memory, storage, embedder, extractor, todoist, capacities, reflector, insighter, config } = lc;

  // Persist the user turn before kicking off the agent.
  memory.episodic.appendMessage({
    sessionId: input.sessionId,
    role: "user",
    content: input.userMessage,
  });

  const tools = buildAllTools({
    memory,
    storage,
    embedder,
    extractor,
    todoist,
    capacities,
    reflector,
    insighter,
    capacitiesDefaultSpaceId: config.capacitiesDefaultSpaceId,
  });
  const mcpServer = createSdkMcpServer({
    name: "lifecoach-memory",
    version: "0.0.1",
    tools,
  });

  const systemPrompt = buildSystemPrompt(memory);
  const baseOptions: Options = {
    model: config.model,
    systemPrompt: { type: "preset", preset: "claude_code", append: systemPrompt },
    mcpServers: buildMcpServers(config, mcpServer),
    permissionMode: "bypassPermissions",
    includePartialMessages: true,
  };

  // Multi-turn coherence: the SDK owns the conversation transcript under its own
  // session id. On the first turn there is none; on later turns we resume so the
  // model actually sees what was said earlier in THIS conversation. Without this
  // every turn was stateless and the coach would "forget" mid-conversation.
  const resumeId = lc.storage.sessions.get(input.sessionId)?.sdkSessionId ?? undefined;
  // If a resume target is stale (transcript cleared, moved machines), fall back
  // to a fresh session rather than hard-failing the turn — but only before we've
  // emitted anything, so the client never sees a half-rendered, restarted reply.
  const attempts: Options[] = resumeId
    ? [{ ...baseOptions, resume: resumeId }, baseOptions]
    : [baseOptions];

  let assistantText = "";
  let toolCallCount = 0;
  let capturedSdkSessionId: string | undefined;
  let emittedAny = false;
  /**
   * Capture the last propose_* tool call declared this turn so the assistant
   * message row can store it in toolUse. The UI reads this to render action
   * buttons (Save artifact / Create N items) without relying on heuristics.
   * We capture the last one because multiple propose calls are unusual, and
   * propose_artifact + propose_actionable_items are mutually exclusive in
   * practice.
   */
  let capturedProposeToolName: string | undefined;
  let capturedProposeInput: Record<string, unknown> | undefined;
  let capturedProposeOutput: string | undefined;
  // Tracks whether the most recent event was a tool call (or its result). When
  // text resumes after that, we need to inject paragraph spacing — otherwise
  // the text block immediately preceding the tool ("Logging this…") concats
  // straight into the post-tool text block ("Got it — here's what…") with no
  // separator. The Anthropic SDK emits these as distinct content blocks, but
  // delta-level streaming doesn't expose the boundary.
  let pendingTextSeparator = false;
  let streamError: unknown;

  for (let attempt = 0; attempt < attempts.length; attempt += 1) {
    const options = attempts[attempt]!;
    const isLast = attempt === attempts.length - 1;
    streamError = undefined;
    try {
      for await (const event of query({ prompt: input.userMessage, options })) {
        // Every SDK message carries the session id; capture it so we can resume
        // this conversation on the next turn. The init event is the earliest.
        const sid = (event as { session_id?: string }).session_id;
        if (typeof sid === "string" && sid.length > 0) capturedSdkSessionId = sid;

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
              emittedAny = true;
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
              emittedAny = true;
              // Capture propose_* calls so the assistant message row can store
              // toolUse for the UI to render action buttons.
              if (
                block.name === "propose_artifact" ||
                block.name === "propose_actionable_items"
              ) {
                capturedProposeToolName = block.name;
                capturedProposeInput = block.input as Record<string, unknown> | undefined ?? undefined;
              }
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
            emittedAny = true;
            // Capture the output text from propose_* results for the toolUse record.
            if (capturedProposeToolName && !error && b.content !== undefined) {
              capturedProposeOutput = extractErrorText(b.content);
            }
            yield {
              type: "tool-result",
              toolUseId: b.tool_use_id,
              ...(b.content !== undefined && !error ? { output: b.content } : {}),
              ...(error ? { error } : {}),
            };
          }
        }
      }
      break; // stream completed without throwing
    } catch (err) {
      streamError = err;
      // Retry fresh only if we were resuming and haven't shown the user
      // anything yet — otherwise surface the error.
      if (!isLast && !emittedAny) {
        assistantText = "";
        toolCallCount = 0;
        pendingTextSeparator = false;
        capturedSdkSessionId = undefined;
        continue;
      }
      break;
    }
  }

  if (streamError) {
    yield {
      type: "error",
      message: streamError instanceof Error ? streamError.message : String(streamError),
    };
    return;
  }

  // Persist the SDK session id so the next turn can resume this conversation.
  if (capturedSdkSessionId && capturedSdkSessionId !== resumeId) {
    lc.storage.sessions.setSdkSessionId(input.sessionId, capturedSdkSessionId);
  }

  // Persist the assistant turn. If the agent called propose_artifact or
  // propose_actionable_items, attach the toolUse so the UI can render the
  // appropriate action button when the session is loaded later.
  memory.episodic.appendMessage({
    sessionId: input.sessionId,
    role: "assistant",
    content: assistantText.trim(),
    ...(capturedProposeToolName
      ? {
          toolUse: {
            name: capturedProposeToolName,
            ...(capturedProposeInput !== undefined ? { input: capturedProposeInput } : {}),
            ...(capturedProposeOutput !== undefined ? { output: capturedProposeOutput } : {}),
          },
        }
      : {}),
  });

  yield {
    type: "done",
    toolCallCount,
    ...(capturedProposeToolName
      ? {
          toolUse: {
            name: capturedProposeToolName,
            ...(capturedProposeInput !== undefined ? { input: capturedProposeInput } : {}),
            ...(capturedProposeOutput !== undefined ? { output: capturedProposeOutput } : {}),
          } satisfies ToolUseCapture,
        }
      : {}),
  };
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
