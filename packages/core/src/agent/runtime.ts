import {
  createSdkMcpServer,
  query,
  type Options,
} from "@anthropic-ai/claude-agent-sdk";
import type { LifecoachConfig } from "../config/index.js";
import type { Memory } from "../memory/index.js";
import type { Storage } from "../storage/index.js";
import type { Embedder } from "../embeddings/index.js";
import type { Extractor } from "../ingest/index.js";
import type { TodoistClient, CapacitiesClient } from "../integrations/index.js";
import type { Reflector } from "../memory/reflector.js";
import type { Insighter } from "../memory/insighter.js";
import type { Session } from "@lifecoach/schemas";
import { buildAllTools } from "./tools/index.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { buildMcpServers } from "./mcp-servers.js";
import { LifecoachError } from "../util/errors.js";

export interface AgentRuntimeDeps {
  config: LifecoachConfig;
  memory: Memory;
  storage: Storage;
  embedder: Embedder;
  extractor: Extractor | null;
  todoist: TodoistClient | null;
  capacities: CapacitiesClient | null;
  reflector: Reflector | null;
  insighter: Insighter | null;
}

export interface ChatTurnInput {
  sessionId: string;
  userMessage: string;
}

export interface ChatTurnOutput {
  assistantText: string;
  /** Number of tool calls the assistant made during the turn. */
  toolCalls: number;
}

/**
 * Stateless wrapper around the Claude Agent SDK that:
 *   - injects the composed system prompt (identity + reflections)
 *   - wires the memory tool surface as an in-process MCP server
 *   - persists user + assistant messages to episodic memory
 *   - returns the final assistant text for display
 *
 * Each call to `chat()` is one logical turn. Multi-turn coherence comes from
 * resuming the SDK's own session transcript: we persist the SDK session id on
 * the first turn and pass it back as `options.resume` on later turns so the
 * model sees the full conversation. Episodic memory is persisted in parallel
 * for our own recall/reflection features, not for in-conversation context.
 */
export class AgentRuntime {
  constructor(private readonly deps: AgentRuntimeDeps) {}

  private assertApiKey(): void {
    if (!this.deps.config.anthropicApiKey) {
      throw new LifecoachError(
        "ANTHROPIC_API_KEY is not set. Add it to .env or export it in your shell.",
        "MISSING_API_KEY",
      );
    }
  }

  startSession(): Session {
    return this.deps.memory.episodic.startSession();
  }

  endSession(sessionId: string, summary?: string): void {
    this.deps.memory.episodic.endSession(sessionId, summary);
  }

  async chat(input: ChatTurnInput): Promise<ChatTurnOutput> {
    this.assertApiKey();
    const { memory, storage, embedder, extractor, todoist, capacities, reflector, insighter, config } =
      this.deps;

    const userMessage = memory.episodic.appendMessage({
      sessionId: input.sessionId,
      role: "user",
      content: input.userMessage,
    });
    await memory.semantic.indexMessage(userMessage);

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

    // Resume the SDK's conversation transcript on subsequent turns so the model
    // retains what was said earlier in this session. See class doc comment.
    const resumeId = storage.sessions.get(input.sessionId)?.sdkSessionId ?? undefined;
    const options: Options = {
      model: config.model,
      systemPrompt: { type: "preset", preset: "claude_code", append: systemPrompt },
      mcpServers: buildMcpServers(config, mcpServer),
      permissionMode: "bypassPermissions",
      includePartialMessages: false,
      ...(resumeId ? { resume: resumeId } : {}),
    };

    let assistantText = "";
    let toolCalls = 0;
    let capturedSdkSessionId: string | undefined;

    for await (const event of query({ prompt: input.userMessage, options })) {
      const sid = (event as { session_id?: string }).session_id;
      if (typeof sid === "string" && sid.length > 0) capturedSdkSessionId = sid;
      if (event.type === "assistant") {
        // The SDK emits assistant message blocks incrementally.
        const blocks = event.message?.content ?? [];
        for (const block of blocks) {
          if (block.type === "text" && typeof block.text === "string") {
            assistantText += block.text;
          } else if (block.type === "tool_use") {
            toolCalls += 1;
          }
        }
      }
    }

    if (capturedSdkSessionId && capturedSdkSessionId !== resumeId) {
      storage.sessions.setSdkSessionId(input.sessionId, capturedSdkSessionId);
    }

    const assistantMessage = memory.episodic.appendMessage({
      sessionId: input.sessionId,
      role: "assistant",
      content: assistantText.trim(),
    });
    await memory.semantic.indexMessage(assistantMessage);

    return { assistantText: assistantText.trim(), toolCalls };
  }
}
