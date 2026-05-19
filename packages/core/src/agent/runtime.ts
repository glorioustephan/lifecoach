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
import type { TodoistClient } from "../integrations/index.js";
import type { Session } from "@lifecoach/schemas";
import { buildAllTools } from "./tools/index.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { LifecoachError } from "../util/errors.js";

export interface AgentRuntimeDeps {
  config: LifecoachConfig;
  memory: Memory;
  storage: Storage;
  embedder: Embedder;
  extractor: Extractor | null;
  todoist: TodoistClient | null;
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
 * Each call to `chat()` is one logical turn. Multi-turn coherence comes from the
 * SDK's session/`continue` mechanics combined with our persisted episodic memory,
 * which we re-inject as context on subsequent sessions.
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
    const { memory, storage, embedder, extractor, todoist, config } = this.deps;

    memory.episodic.appendMessage({
      sessionId: input.sessionId,
      role: "user",
      content: input.userMessage,
    });

    const tools = buildAllTools({ memory, storage, embedder, extractor, todoist });
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
      includePartialMessages: false,
    };

    let assistantText = "";
    let toolCalls = 0;

    for await (const event of query({ prompt: input.userMessage, options })) {
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

    memory.episodic.appendMessage({
      sessionId: input.sessionId,
      role: "assistant",
      content: assistantText.trim(),
    });

    return { assistantText: assistantText.trim(), toolCalls };
  }
}
